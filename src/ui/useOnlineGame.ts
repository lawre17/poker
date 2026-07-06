import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError } from '../api/client';
import { useAuth } from '../api/auth';
import {
  getMatchState,
  leaveMatch,
  pingTimeout,
  requestRematch,
  Roster,
  sendChat,
  sendMove,
} from '../api/matches';
import { ReverbClient } from '../realtime/reverb';
import { GameState, Move, Rank, Suit } from '../game/types';
import { initSounds, playSound } from './sound';

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
// Ask the server to skip the current player after this long. The server is the
// real clock (40s); we use a little more so a premature request can't race it.
const TURN_TIMEOUT_MS = 42000;

interface UseOnlineGameArgs {
  matchId: string;
  // The initial roster (from create/join/start). Used to map the signed-in
  // user to their engine id so GameScreen renders the right hand.
  roster: Roster;
  onExit: () => void;
  // Called when a rematch has been created — jump into the new match.
  onRematch?: (newMatchId: string, roster: Roster) => void;
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
export function useOnlineGame({
  matchId,
  roster,
  onExit,
  onRematch,
}: UseOnlineGameArgs) {
  const { token, user, refreshMe } = useAuth();
  const [state, setState] = useState<GameState | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [currentRoster, setCurrentRoster] = useState<Roster>(roster);

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

  // Rematch readiness after a finished game (null until someone opts in).
  const [rematch, setRematch] = useState<{
    ready: string[];
    total: number;
    cannot: boolean;
  } | null>(null);
  // Navigation callback in a ref so the socket effect needn't depend on it.
  const onRematchRef = useRef(onRematch);
  onRematchRef.current = onRematch;

  const clientRef = useRef<ReverbClient | null>(null);
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevState = useRef<GameState | null>(null);

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
      onRematch: (p) =>
        setRematch({ ready: p.ready, total: p.total, cannot: p.cannot }),
      onRematchStarted: (p) => onRematchRef.current?.(p.newMatchId, p.roster),
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

  // If it's someone else's turn and they stall (or have left), ask the server to
  // skip them after the timeout. Resets whenever the turn changes. The server
  // validates the elapsed time, so concurrent requests are harmless no-ops.
  const currentIndex = state?.currentPlayerIndex;
  useEffect(() => {
    if (!state || state.phase === 'finished') return;
    const current = state.players[state.currentPlayerIndex];
    if (!current || current.id === selfId) return; // never time out my own turn
    const t = setTimeout(() => {
      pingTimeout(matchId).catch(() => {});
    }, TURN_TIMEOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, state?.phase, selfId, matchId]);

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
    (cardIds: string[], chosenSuit?: Suit, demandRank?: Rank) => {
      hapticLight();
      void dispatch({ type: 'playSequence', cardIds, chosenSuit, demandRank });
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

  // Plain close (no forfeit) — used from the connecting/waiting screen.
  const exit = useCallback(() => {
    clientRef.current?.close();
    clientRef.current = null;
    onExit();
  }, [onExit]);

  // Intentional leave = forfeit. Tell the server (best-effort) then close.
  const leave = useCallback(() => {
    void leaveMatch(matchId).catch(() => {});
    clientRef.current?.close();
    clientRef.current = null;
    onExit();
  }, [matchId, onExit]);

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

  // --- Rematch --------------------------------------------------------------
  const acceptRematch = useCallback(() => {
    void requestRematch(matchId)
      .then((res) => {
        if (res.cannot) {
          showFeedback("Can't rematch — not enough players.");
          return;
        }
        // The accepter who completes it gets the new match directly; others get
        // it via the rematchStarted broadcast.
        if (res.started && res.newMatchId) {
          onRematchRef.current?.(res.newMatchId, res.roster);
        }
      })
      .catch(() => showFeedback('Could not request a rematch.'));
  }, [matchId, showFeedback]);

  const myId = user != null ? String(user.id) : null;
  const rematchInfo = rematch
    ? {
        total: rematch.total,
        readyCount: rematch.ready.length,
        mineAccepted: myId != null && rematch.ready.map(String).includes(myId),
        cannot: rematch.cannot,
        requesterName: (() => {
          const otherId = rematch.ready
            .map(String)
            .find((id) => id !== myId);
          const entry = currentRoster.find(
            (r) => String(r.userId) === otherId
          );
          return entry?.name ?? null;
        })(),
      }
    : null;

  // While waiting on others after accepting, re-poll so a missed rematchStarted
  // broadcast still lands us in the new game (the request is idempotent).
  const waiting = rematchInfo?.mineAccepted ?? false;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => {
      void requestRematch(matchId)
        .then((res) => {
          if (res.started && res.newMatchId) {
            onRematchRef.current?.(res.newMatchId, res.roster);
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [waiting, matchId]);

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
    leave,
    // Text chat
    messages,
    unreadChat,
    sendChatMessage,
    markChatRead,
    floats,
    // Rematch
    rematchInfo,
    acceptRematch,
  };
}
