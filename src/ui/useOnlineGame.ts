import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../api/auth';
import { getMatchState, Roster, sendMove, sendVoice } from '../api/matches';
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

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const clientRef = useRef<ReverbClient | null>(null);
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevState = useRef<GameState | null>(null);
  const voiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Remote-clip players are kept alive until playback finishes, then released.
  const voicePlayers = useRef<{ remove: () => void }[]>([]);

  // Map the signed-in user to their engine id (e.g. 'p1') for GameScreen.
  const selfEntry = currentRoster.find(
    (r) => user != null && String(r.userId) === String(user.id)
  );
  const selfId = selfEntry?.engineId ?? 'p0';

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    if (fbTimer.current) clearTimeout(fbTimer.current);
    fbTimer.current = setTimeout(() => setFeedback(null), 2500);
  }, []);

  useEffect(() => {
    initSounds();
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
      onStatus: (s) => setStatus(s),
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [matchId, token, refreshMe, user]);

  // Once subscribed, fetch the current authoritative state so we render
  // immediately instead of waiting for the next broadcast (the one-time initial
  // state may have been sent before we subscribed). Re-runs on reconnect.
  // Guard against regressing a newer state already pushed over the socket.
  useEffect(() => {
    if (status !== 'subscribed') return;
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
  }, [status, matchId]);

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
    if (autoStopTimer.current) {
      clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
    }
    if (!recording) return;
    setRecording(false);
    try {
      await recorder.stop();
    } catch {
      return;
    }
    const uri = recorder.uri;
    if (!uri) return;
    setSendingVoice(true);
    try {
      await sendVoice(matchId, uri);
    } catch {
      showFeedback('Could not send voice — check your connection.');
    } finally {
      setSendingVoice(false);
    }
  }, [recording, recorder, matchId, showFeedback]);

  const startRecording = useCallback(async () => {
    if (recording || sendingVoice) return;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        showFeedback('Microphone permission is needed to talk.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      hapticLight();
      // Safety auto-stop so a stuck press can't record indefinitely.
      autoStopTimer.current = setTimeout(() => {
        void stopRecording();
      }, MAX_RECORD_MS);
    } catch {
      setRecording(false);
      showFeedback('Could not start recording.');
    }
  }, [recording, sendingVoice, recorder, showFeedback, stopRecording]);

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
        // The new state arrives via the socket — nothing to do on success.
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
    [matchId, state, showFeedback]
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
  };
}
