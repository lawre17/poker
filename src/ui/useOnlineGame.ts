import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../api/auth';
import { Roster, sendMove } from '../api/matches';
import { ReverbClient } from '../realtime/reverb';
import { GameState, Move, Suit } from '../game/types';
import { initSounds, playSound } from './sound';

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

  const clientRef = useRef<ReverbClient | null>(null);
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevState = useRef<GameState | null>(null);

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
      onStatus: (s) => setStatus(s),
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [matchId, token, refreshMe]);

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
  };
}
