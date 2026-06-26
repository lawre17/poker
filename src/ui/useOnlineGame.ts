import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError } from '../api/client';
import { useAuth } from '../api/auth';
import {
  getMatchState,
  Roster,
  sendChat,
  sendMove,
  sendVoice,
} from '../api/matches';
import { ReverbClient } from '../realtime/reverb';
import { GameState, Move, Suit } from '../game/types';
import { initSounds, playSound } from './sound';

// Auto-stop a held recording after this long so a stuck press can't run forever.
const MAX_RECORD_MS = 15000;

export type ConnStatus =
  | 'connecting'
  | 'connected'
  | 'subscribed'
  | 'closed';

export interface ChatMsg {
  id: string;
  fromName: string;
  text: string;
  self: boolean;
}

// Keep only the most recent messages in memory — chat is ephemeral.
const MAX_CHAT = 50;

interface UseOnlineGameArgs {
  matchId: string;
  // The initial roster (from create/join/start). Used to map the signed-in
  // user to their engine id so GameScreen renders the right hand.
  roster: Roster;
  onExit: () => void;
}

function hapticLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/**
 * Networked equivalent of useGame. Holds the authoritative server GameState
 * (pushed via Reverb), and exposes the same action surface GameScreen needs.
 * Each action POSTs a Move to the server; the resulting state arrives over the
 * socket.
 */
export function useOnlineGame({ matchId, roster, onExit }: UseOnlineGameArgs) {
  const { token, user, refreshMe } = useAuth();
  const [state, setState] = useState<GameState | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [currentRoster, setCurrentRoster] = useState<Roster>(roster);

  // Push-to-talk: who's currently speaking (cleared after ~3s) and whether the
  // local user is recording / uploading right now.
  const [lastVoiceFrom, setLastVoiceFrom] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);

  // Text chat (ephemeral). messages holds a rolling window; unreadChat counts
  // messages received while the chat panel is closed.
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);
  const chatSeq = useRef(0);
  // Floating Ludo-style bubbles, keyed by the sender's engine seat id.
  const [floats, setFloats] = useState<Record<string, { id: string; text: string }>>(
    {}
  );
  const floatSeq = useRef(0);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const clientRef = useRef<ReverbClient | null>(null);
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevState = useRef<GameState | null>(null);
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Remote-clip players are kept alive until playback finishes, then released.
  const voicePlayers = useRef<{ remove: () => void }[]>([]);
  // Push-to-talk coordination. The button's press-in fires an async start
  // (prepare->record); a quick release can land before recording actually
  // begins, so we track intent (want) and the real recorder state (active) via
  // refs to avoid stale closures and orphaned recordings.
  const wantRecordingRef = useRef(false);
  const recordingRef = useRef(false);
  const micGrantedRef = useRef(false);

  // Map the signed-in user to their engine id (e.g. 'p1') for GameScreen.
  const selfEntry = currentRoster.find(
    (r) => user != null && String(r.userId) === String(user.id)
  );
  const selfId = selfEntry?.engineId ?? 'p0';

  // Latest roster in a ref so the chat handler (captured in the socket effect)
  // can map a sender's user id to their engine seat without going stale.
  const rosterRef = useRef(currentRoster);
  rosterRef.current = currentRoster;

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    if (fbTimer.current) clearTimeout(fbTimer.current);
    fbTimer.current = setTimeout(() => setFeedback(null), 2500);
  }, []);

  useEffect(() => {
    initSounds();
  }, []);

  // Pre-warm microphone permission and the recording audio mode once on mount so
  // the first hold-to-talk press records instantly instead of being eaten by the
  // permission dialog (the original cause of "recording doesn't work").
  useEffect(() => {
    let done = false;
    (async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (done) return;
        micGrantedRef.current = perm.granted;
        if (perm.granted) {
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        }
      } catch {
        /* ignore — handled again lazily on first press */
      }
    })();
    return () => {
      done = true;
    };
  }, []);

  // Sound effects for state transitions, mirroring useGame.
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = state;
    if (!state || !prev) return;

    if (state.phase === 'finished' && prev.phase !== 'finished') {
      const won = state.winnerId === selfId;
      playSound(won ? 'win' : 'lose');
      Haptics.notificationAsync(
        won
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      ).catch(() => {});
      return;
    }

    const newlyAnnounced = Object.keys(state.announcedKadi).some(
      (id) => state.announcedKadi[id] && !prev.announcedKadi[id]
    );
    const handTotal = (g: GameState) =>
      g.players.reduce((s, p) => s + p.hand.length, 0);

    if (newlyAnnounced) playSound('kadi');
    else if (state.pendingPenalty > prev.pendingPenalty) playSound('penalty');
    else if (state.skipCount > prev.skipCount) playSound('skip');
    else if (state.discardPile.length > prev.discardPile.length)
      playSound('play');
    else if (handTotal(state) > handTotal(prev)) playSound('draw');
  }, [state, selfId]);

  // Open the Reverb connection for this match.
  useEffect(() => {
    if (!token) return;
    const client = new ReverbClient(matchId, token, {
      onGameState: (p) => setState(p.state),
      onRoomState: (p) => setCurrentRoster(p.roster),
      onAwarded: () => {
        // Coins changed on the server — refresh the wallet.
        void refreshMe();
      },
      onVoice: ({ fromUserId, fromName, url }) => {
        // Never play back our OWN message.
        if (user != null && String(fromUserId) === String(user.id)) return;
        playRemoteVoice(url);
        setLastVoiceFrom(fromName);
        if (voiceTimer.current) clearTimeout(voiceTimer.current);
        voiceTimer.current = setTimeout(() => setLastVoiceFrom(null), 3000);
      },
      onChat: ({ fromUserId, fromName, text }) => {
        // Every message (including our own) arrives via the broadcast echo, so
        // chat has a single source of truth.
        const self = user != null && String(fromUserId) === String(user.id);
        chatSeq.current += 1;
        const id = `c${chatSeq.current}`;
        setMessages((cur) => {
          const next = [...cur, { id, fromName, text, self }];
          return next.length > MAX_CHAT ? next.slice(next.length - MAX_CHAT) : next;
        });
        if (!self) setUnreadChat((n) => n + 1);

        // Pop a floating bubble over the sender's seat (cleared after ~3.5s).
        const entry = rosterRef.current.find(
          (r) => String(r.userId) === String(fromUserId)
        );
        const engineId = entry?.engineId;
        if (engineId) {
          floatSeq.current += 1;
          const fid = `f${floatSeq.current}`;
          setFloats((prev) => ({ ...prev, [engineId]: { id: fid, text } }));
          setTimeout(() => {
            setFloats((prev) => {
              if (prev[engineId]?.id !== fid) return prev;
              const next = { ...prev };
              delete next[engineId];
              return next;
            });
          }, 3500);
        }
      },
      onStatus: (s) => setStatus(s),
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [matchId, token, refreshMe, user]);

  // Fetch the authoritative state and reconcile it with what we have. The Reverb
  // broadcast is the fast path, but it is fire-and-forget: if a single gameState
  // message never reaches us (socket blip, app backgrounded, lobby->game
  // transition racing the first broadcast) we would otherwise sit on stale state
  // forever. This pull lets any missed update self-heal. The guard never lets a
  // pulled state regress a newer one already pushed over the socket.
  const syncState = useCallback(() => {
    let cancelled = false;
    getMatchState(matchId)
      .then((res) => {
        if (cancelled) return;
        if (res.roster?.length) setCurrentRoster(res.roster);
        if (res.state) {
          setState((cur) =>
            cur && (res.state!.log?.length ?? 0) < (cur.log?.length ?? 0)
              ? cur
              : res.state
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  // Once subscribed, pull immediately so we render without waiting for the next
  // broadcast (the one-time initial state may have been sent before we
  // subscribed). Re-runs on reconnect.
  useEffect(() => {
    if (status !== 'subscribed') return;
    return syncState();
  }, [status, syncState]);

  // Periodic re-sync while the game is live, so a dropped broadcast recovers
  // quickly even if the socket went silently dead (common on mobile). Stops once
  // the game finishes. /state is ~1-2ms on the engine, so a 2s cadence is cheap.
  useEffect(() => {
    if (state?.phase === 'finished') return;
    const id = setInterval(() => syncState(), 2000);
    return () => clearInterval(id);
  }, [state?.phase, syncState]);

  // Re-sync the moment the app returns to the foreground: backgrounding is the
  // most common way the socket silently drops a message.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncState();
    });
    return () => sub.remove();
  }, [syncState]);

  // --- Push-to-talk ---------------------------------------------------------

  // Play a remote clip from its URL, releasing the player once it ends.
  const playRemoteVoice = useCallback((url: string) => {
    try {
      const player = createAudioPlayer({ uri: url });
      const sub = player.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish) {
          sub.remove();
          try {
            player.remove();
          } catch {
            /* ignore */
          }
        }
      });
      voicePlayers.current.push(sub);
      player.play();
    } catch {
      // ignore — a single clip failing to play shouldn't disrupt the game.
    }
  }, []);

  const stopRecording = useCallback(async () => {
    // Signal "stop" regardless of whether start has finished its async setup.
    wantRecordingRef.current = false;
    if (autoStopTimer.current) {
      clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
    }
    // Released before recording actually began: make sure a recorder that raced
    // past us is still stopped, then bail without uploading an empty clip.
    if (!recordingRef.current) {
      try {
        if (recorder.isRecording) await recorder.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    recordingRef.current = false;
    setRecording(false);
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri ?? null;
    } catch {
      return;
    }
    if (!uri) return;
    setSendingVoice(true);
    try {
      await sendVoice(matchId, uri);
    } catch {
      showFeedback('Could not send voice — check your connection.');
    } finally {
      setSendingVoice(false);
    }
  }, [recorder, matchId, showFeedback]);

  const startRecording = useCallback(async () => {
    if (recordingRef.current || sendingVoice) return;
    wantRecordingRef.current = true;
    try {
      if (!micGrantedRef.current) {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        micGrantedRef.current = perm.granted;
        if (!perm.granted) {
          wantRecordingRef.current = false;
          showFeedback('Microphone permission is needed to talk.');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }
      await recorder.prepareToRecordAsync();
      // The user may have released during prepare — honour that.
      if (!wantRecordingRef.current) return;
      recorder.record();
      recordingRef.current = true;
      setRecording(true);
      hapticLight();
      // Safety auto-stop so a stuck press can't record indefinitely.
      autoStopTimer.current = setTimeout(() => {
        void stopRecording();
      }, MAX_RECORD_MS);
    } catch {
      wantRecordingRef.current = false;
      recordingRef.current = false;
      setRecording(false);
      showFeedback('Could not start recording.');
    }
  }, [sendingVoice, recorder, showFeedback, stopRecording]);

  // Tear down any pending timers / players on unmount.
  useEffect(() => {
    return () => {
      if (voiceTimer.current) clearTimeout(voiceTimer.current);
      if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
      voicePlayers.current.forEach((s) => {
        try {
          s.remove();
        } catch {
          /* ignore */
        }
      });
      voicePlayers.current = [];
    };
  }, []);

  // Send a move; surface 422 errors as feedback.
  const dispatch = useCallback(
    async (move: Move) => {
      if (!state || state.phase === 'finished') return;
      try {
        await sendMove(matchId, move);
        // Pull the authoritative post-move state immediately so the acting
        // player's screen advances right away instead of waiting for the
        // Reverb echo (which a quiet/backgrounded socket can miss).
        syncState();
      } catch (e) {
        if (e instanceof ApiError) {
          showFeedback(e.message || 'Illegal move');
        } else {
          showFeedback('Could not send move — check your connection.');
        }
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error
        ).catch(() => {});
      }
    },
    [matchId, state, showFeedback, syncState]
  );

  const playCard = useCallback(
    (cardId: string, chosenSuit?: Suit) => {
      hapticLight();
      void dispatch({ type: 'play', cardId, chosenSuit });
    },
    [dispatch]
  );
  const playSequence = useCallback(
    (cardIds: string[], chosenSuit?: Suit) => {
      hapticLight();
      void dispatch({ type: 'playSequence', cardIds, chosenSuit });
    },
    [dispatch]
  );
  const draw = useCallback(() => {
    hapticLight();
    void dispatch({ type: 'draw' });
  }, [dispatch]);
  const skipTurn = useCallback(() => {
    hapticLight();
    void dispatch({ type: 'skipTurn' });
  }, [dispatch]);
  const announceKadi = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
    void dispatch({ type: 'announceKadi' });
  }, [dispatch]);

  const exit = useCallback(() => {
    clientRef.current?.close();
    clientRef.current = null;
    onExit();
  }, [onExit]);

  // --- Text chat ------------------------------------------------------------
  const sendChatMessage = useCallback(
    (text: string) => {
      const t = text.trim().slice(0, 200);
      if (!t) return;
      void sendChat(matchId, t).catch(() => {
        showFeedback('Could not send message.');
      });
    },
    [matchId, showFeedback]
  );

  const markChatRead = useCallback(() => setUnreadChat(0), []);

  return {
    state,
    feedback,
    status,
    roster: currentRoster,
    selfId,
    playCard,
    playSequence,
    draw,
    skipTurn,
    announceKadi,
    exit,
    // Push-to-talk
    lastVoiceFrom,
    recording,
    sendingVoice,
    startRecording,
    stopRecording,
    // Text chat
    messages,
    unreadChat,
    sendChatMessage,
    markChatRead,
    floats,
  };
}
