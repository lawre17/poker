import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { decideMove } from '../game/ai';
import { applyMove, createGame, PlayerConfig } from '../game/engine';
import { DEFAULT_SETTINGS, GameSettings, GameState, Move, Rank, Suit } from '../game/types';
import { initSounds, playSound } from './sound';

export interface NewGameOptions {
  opponents: number; // number of AI players
  playerName?: string;
  settings?: GameSettings;
}

export const HUMAN_ID = 'you';

function buildConfigs(opponents: number, playerName = 'You'): PlayerConfig[] {
  const configs: PlayerConfig[] = [
    { id: HUMAN_ID, name: playerName, isAI: false },
  ];
  const names = ['Bot Ada', 'Bot Kojo', 'Bot Zola', 'Bot Imani'];
  for (let i = 0; i < opponents; i++) {
    configs.push({ id: `ai${i}`, name: names[i % names.length], isAI: true });
  }
  return configs;
}

const AI_DELAY_MS = 850;

function hapticLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevState = useRef<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    if (fbTimer.current) clearTimeout(fbTimer.current);
    fbTimer.current = setTimeout(() => setFeedback(null), 2500);
  }, []);

  useEffect(() => {
    initSounds();
  }, []);

  // Play a sound (and celebratory haptic) for whatever just changed.
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = state;
    stateRef.current = state;
    if (!state || !prev) return;

    if (state.phase === 'finished' && prev.phase !== 'finished') {
      const won = state.winnerId === HUMAN_ID;
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
    else if (state.discardPile.length > prev.discardPile.length) playSound('play');
    else if (handTotal(state) > handTotal(prev)) playSound('draw');
  }, [state]);

  const newGame = useCallback((opts: NewGameOptions) => {
    if (timer.current) clearTimeout(timer.current);
    const configs = buildConfigs(opts.opponents, opts.playerName);
    const game = createGame(configs, opts.settings ?? DEFAULT_SETTINGS);
    stateRef.current = game;
    setFeedback(null);
    setState(game);
  }, []);

  const exitToMenu = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    stateRef.current = null;
    setState(null);
  }, []);

  // Apply a human move. Illegal moves are rejected by the rules and surfaced as
  // feedback (important for manual mode).
  const dispatch = useCallback(
    (move: Move) => {
      const cur = stateRef.current;
      if (!cur || cur.phase === 'finished') return;
      try {
        const next = applyMove(cur, move);
        stateRef.current = next;
        setState(next);
      } catch (e) {
        showFeedback((e as Error)?.message ?? 'Illegal move');
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error
        ).catch(() => {});
      }
    },
    [showFeedback]
  );

  // Drive AI turns automatically.
  useEffect(() => {
    if (!state || state.phase === 'finished') return;
    const current = state.players[state.currentPlayerIndex];
    if (!current.isAI) return;

    timer.current = setTimeout(() => {
      setState((prev) => {
        if (!prev || prev.phase === 'finished') return prev;
        const cur = prev.players[prev.currentPlayerIndex];
        if (!cur.isAI) return prev;
        try {
          return applyMove(prev, decideMove(prev));
        } catch {
          return prev;
        }
      });
    }, AI_DELAY_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);

  const playCard = useCallback(
    (cardId: string, chosenSuit?: Suit) => {
      hapticLight();
      dispatch({ type: 'play', cardId, chosenSuit });
    },
    [dispatch]
  );
  const playSequence = useCallback(
    (cardIds: string[], chosenSuit?: Suit, demandRank?: Rank) => {
      hapticLight();
      dispatch({ type: 'playSequence', cardIds, chosenSuit, demandRank });
    },
    [dispatch]
  );
  const draw = useCallback(() => {
    hapticLight();
    dispatch({ type: 'draw' });
  }, [dispatch]);
  // "Still Kadi": pick a card but keep a previously-declared Kadi (used when the
  // suit doesn't yet let you finish).
  const stillKadi = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
    dispatch({ type: 'draw', keepKadi: true });
  }, [dispatch]);
  const skipTurn = useCallback(() => {
    hapticLight();
    dispatch({ type: 'skipTurn' });
  }, [dispatch]);
  const announceKadi = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
    dispatch({ type: 'announceKadi' });
  }, [dispatch]);

  return {
    state,
    feedback,
    newGame,
    exitToMenu,
    playCard,
    playSequence,
    draw,
    stillKadi,
    skipTurn,
    announceKadi,
  };
}
