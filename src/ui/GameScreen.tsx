import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  canStartSequence,
  cardsConnect,
  isPlayable,
  topCard,
} from '../game/rules';
import { Card, GameState, Suit } from '../game/types';
import { CardView } from './CardView';
import { ChatBubble } from './ChatBubble';
import { FlyingCardsOverlay, useCardFlights } from './FlyingCards';
import { useSettings } from './SettingsContext';
import { getMuted, setMuted } from './sound';
import { SuitPicker } from './SuitPicker';
import { colors, suitColor, suitSymbol } from './theme';
import { HUMAN_ID } from './useGame';

// Size of a large card (must match CardView's `lg` size).
const HAND_CARD_W = 92;
const HAND_CARD_H = 132;
// Radial fan tuning: total arc is capped so many cards still fit on screen, and
// the pivot sits below the cards (as a % of card height) to set the curve.
const FAN_MAX_SPREAD = 64; // max total degrees across the whole hand
const FAN_PER_CARD = 8; // degrees between adjacent cards (before the cap)
const FAN_ORIGIN_PCT = 240; // transform-origin Y: pivot below the card (curve)

// Ordering used by the "Sort" button: group by suit, then by rank.
const SUIT_SORT: Record<string, number> = {
  spades: 0,
  hearts: 1,
  clubs: 2,
  diamonds: 3,
};
const RANK_SORT: Record<string, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

interface Props {
  state: GameState;
  feedback?: string | null;
  onPlay: (cardId: string, chosenSuit?: Suit) => void;
  onPlaySequence: (cardIds: string[], chosenSuit?: Suit) => void;
  onDraw: () => void;
  onSkipTurn: () => void;
  onAnnounceKadi: () => void;
  onExit: () => void;
  // The engine id of the local player whose hand should be shown. Defaults to
  // the offline human ('you') so the single-player flow is unchanged; online
  // play passes the local player's engine id (e.g. 'p1').
  selfId?: string;
  // Floating chat bubbles keyed by engine seat id (online play only).
  floats?: Record<string, { id: string; text: string }>;
  // Rematch (online only): opt-in handler + current readiness.
  onRematch?: () => void;
  rematch?: {
    total: number;
    readyCount: number;
    mineAccepted: boolean;
    cannot: boolean;
    requesterName: string | null;
  } | null;
  // Label of the post-game button (defaults to "Back to menu"). Tournament
  // matches override it to return to the bracket.
  exitLabel?: string;
}

type AcePicker = null | { mode: 'single'; cardId: string } | { mode: 'commit' };

export function GameScreen({
  state,
  feedback,
  onPlay,
  onPlaySequence,
  onDraw,
  onSkipTurn,
  onAnnounceKadi,
  onExit,
  selfId = HUMAN_ID,
  floats,
  onRematch,
  rematch,
  exitLabel = 'Back to menu',
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [acePicker, setAcePicker] = useState<AcePicker>(null);
  // Player's preferred hand order (card ids). Purely cosmetic — the engine
  // never cares about order. Reconciled with the actual hand below.
  const [order, setOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const pan = useRef(new Animated.ValueXY()).current;
  const dragRef = useRef<{
    id: string;
    startIndex: number;
    started: boolean;
    timer: ReturnType<typeof setTimeout> | null;
    ox: number; // card's fan x-offset from centre at grab time
    oy: number; // card's fan y-offset (edge cards sit lower)
  } | null>(null);

  const human =
    state.players.find((p) => p.id === selfId) ?? state.players[0];
  const opponents = state.players.filter((p) => p.id !== human.id);
  const current = state.players[state.currentPlayerIndex];
  const isHumanTurn = current.id === human.id && state.phase === 'playing';
  const top = topCard(state);
  const cleanTurn = canStartSequence(state); // may build a multi-card throw
  const assisted = state.settings.assistedMode;

  // Drop any in-progress selection when it's no longer our clean turn.
  useEffect(() => {
    if (!isHumanTurn || !cleanTurn) setSelected([]);
  }, [isHumanTurn, cleanTurn, state.currentPlayerIndex]);

  const selectedCards = selected
    .map((id) => human.hand.find((c) => c.id === id))
    .filter((c): c is Card => !!c);

  // Fan the hand as a radial arc so it holds many cards: every card rotates
  // around a shared pivot below the hand, with the spread capped to fit on
  // screen (the angle per card shrinks as the hand grows).
  const { width: screenW } = useWindowDimensions();
  const handCount = human.hand.length;
  const fanSpread = Math.min(FAN_MAX_SPREAD, (handCount - 1) * FAN_PER_CARD);
  const anglePer = handCount > 1 ? fanSpread / (handCount - 1) : 0;
  const fanMid = (handCount - 1) / 2;
  // Distance from a card's centre to the pivot (used to place each card on the arc).
  const fanRadius = HAND_CARD_H * (FAN_ORIGIN_PCT / 100 - 0.5);
  const handLeft = screenW / 2 - HAND_CARD_W / 2;
  // Edge cards sit lower on the arc; lift the whole fan so they clear the bottom,
  // and give the container enough height for the raised middle card + pop-up.
  const fanDrop =
    fanRadius * (1 - Math.cos((fanSpread / 2) * (Math.PI / 180)));
  const fanBottom = Math.round(fanDrop) + 6;
  const fanHeight = fanBottom + HAND_CARD_H + 50;
  // A card's centre offset (from the fan centre) for its index — used to lift a
  // dragged card from exactly where it sits and to pick the nearest drop slot.
  const fanRad = (idx: number) => ((idx - fanMid) * anglePer * Math.PI) / 180;
  const fanX = (idx: number) => fanRadius * Math.sin(fanRad(idx));
  const fanY = (idx: number) => fanRadius * (1 - Math.cos(fanRad(idx)));

  // Can this card be added to the current selection?
  const canAddCard = (card: Card): boolean => {
    if (selected.length === 0) return isPlayable(state, card);
    return cardsConnect(selectedCards[selectedCards.length - 1], card);
  };

  // A selection that uses the whole hand is a winning throw — in assisted mode
  // we block it until "Kadi" is declared; in manual mode the engine rejects it.
  const selectionWins = selected.length > 0 && selected.length === human.hand.length;
  // You can only go out if you declared on an EARLIER turn (not this one).
  const canWinNow = state.announcedKadi[human.id] && !state.declaredThisTurn;
  const blockedWin = assisted && selectionWins && !canWinNow;

  const handlePress = (card: Card) => {
    if (!isHumanTurn) return;
    if (!cleanTurn) {
      // Single play: penalty counter, Ace block, skip bounce, or answer.
      if (assisted && !isPlayable(state, card)) return; // manual lets you try
      if (card.rank === 'A') setAcePicker({ mode: 'single', cardId: card.id });
      else onPlay(card.id);
      return;
    }
    // Clean turn — build a selection (tap to add, tap again to remove).
    const idx = selected.indexOf(card.id);
    if (idx >= 0) {
      setSelected(selected.slice(0, idx)); // remove this card and any after it
    } else if (!assisted || canAddCard(card)) {
      setSelected([...selected, card.id]); // manual: add any card freely
    }
  };

  const doCommit = (chosenSuit?: Suit) => {
    if (selected.length === 1) onPlay(selected[0], chosenSuit);
    else if (selected.length >= 2) onPlaySequence(selected, chosenSuit);
    setSelected([]);
  };

  const commit = () => {
    if (selected.length === 0 || blockedWin) return;
    const last = selectedCards[selectedCards.length - 1];
    if (last.rank === 'A') setAcePicker({ mode: 'commit' });
    else doCommit();
  };

  // Declaring is offered only when you actually hold a winning play (the engine
  // Declaring is always available on your turn until you've declared. It doesn't
  // end your turn, but you can only WIN on a later turn.
  const canAnnounce = isHumanTurn && !state.announcedKadi[human.id];

  const [muted, setMutedState] = useState(getMuted());
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  // Pulse the "Niko Kadi!" button while it matters.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!canAnnounce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 480, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 480, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(1);
    };
  }, [canAnnounce, pulse]);

  // Slide the new top card up into the discard pile whenever it changes.
  const topAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    topAnim.setValue(0);
    Animated.spring(topAnim, {
      toValue: 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [top.id, topAnim]);
  const slideRot = top.id.charCodeAt(0) % 2 === 0 ? '8deg' : '-8deg';
  const topCardStyle = {
    opacity: topAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [
      {
        translateY: topAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [100, 0],
        }),
      },
      {
        scale: topAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
      },
      {
        rotate: topAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [slideRot, '0deg'],
        }),
      },
    ],
  };

  // Scale-in the winner banner.
  const winPop = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (state.phase === 'finished') {
      winPop.setValue(0.5);
      Animated.spring(winPop, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    }
  }, [state.phase, winPop]);

  // --- Flying-card draw animation -------------------------------------------
  // When a player draws, send face-down cards flying from the draw pile to their
  // stack (my hand, or an opponent's fan). Positions are measured live so the
  // arc always lands right despite the radial fan and safe-area insets.
  const { flights, launch, remove } = useCardFlights();
  const drawPileRef = useRef<View>(null);
  const handRef = useRef<View>(null);
  const overlayRef = useRef<View>(null);
  const oppRefs = useRef<Record<string, View | null>>({});
  const prevStateRef = useRef<GameState | null>(null);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (!prev) return; // skip the opening deal

    // A draw grows exactly one player's hand; a fresh deal grows everyone's, and
    // a play shrinks one — so a single grower uniquely identifies a draw.
    const prevCount = new Map(prev.players.map((p) => [p.id, p.hand.length]));
    const growers = state.players.filter(
      (p) => p.hand.length > (prevCount.get(p.id) ?? p.hand.length)
    );
    if (growers.length !== 1) return;

    const drew = growers[0];
    // Fly the real number drawn, capped at 3 so big stacked penalties stay tidy.
    const count = Math.min(drew.hand.length - (prevCount.get(drew.id) ?? 0), 3);
    const pile = drawPileRef.current;
    const overlay = overlayRef.current;
    const target = drew.id === human.id ? handRef.current : oppRefs.current[drew.id];
    if (!pile || !overlay || !target) return;

    const rectOf = (node: View) =>
      new Promise<{ x: number; y: number; w: number; h: number }>((resolve) =>
        node.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }))
      );

    let cancelled = false;
    Promise.all([rectOf(pile), rectOf(target), rectOf(overlay)]).then(
      ([p, t, o]) => {
        if (cancelled) return;
        launch(
          { x: p.x + p.w / 2 - o.x, y: p.y + p.h / 2 - o.y },
          { x: t.x + t.w / 2 - o.x, y: t.y + t.h / 2 - o.y },
          count
        );
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Buzz the phone the moment the turn becomes mine (opt-out in Settings).
  const { prefs } = useSettings();
  const wasMyTurnRef = useRef(false);
  useEffect(() => {
    const was = wasMyTurnRef.current;
    wasMyTurnRef.current = isHumanTurn;
    if (isHumanTurn && !was && prefs.vibrateOnMyTurn) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, [isHumanTurn, prefs.vibrateOnMyTurn]);

  // --- Hand ordering (drag-to-reorder + Sort) -------------------------------
  // Keep `order` in sync with the actual hand: preserve the player's custom
  // order for cards they still hold, append freshly drawn cards at the end, and
  // drop played cards. Runs only when the hand's composition changes (by id), so
  // a drag/sort that just permutes the same ids is never undone.
  const handKey = human.hand.map((c) => c.id).join(',');
  useEffect(() => {
    const ids = human.hand.map((c) => c.id);
    const idSet = new Set(ids);
    setOrder((prev) => {
      const kept = prev.filter((id) => idSet.has(id));
      const keptSet = new Set(kept);
      const next = [...kept, ...ids.filter((id) => !keptSet.has(id))];
      const same =
        next.length === prev.length && next.every((v, i) => v === prev[i]);
      return same ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handKey]);

  // The hand in display order. Falls back to hand order for any id not yet in
  // `order` (covers the render before the reconcile effect runs).
  const handById = useMemo(
    () => new Map(human.hand.map((c) => [c.id, c])),
    [human.hand]
  );
  const orderedHand = useMemo(() => {
    const out: Card[] = [];
    const seen = new Set<string>();
    for (const id of order) {
      const c = handById.get(id);
      if (c && !seen.has(id)) {
        out.push(c);
        seen.add(id);
      }
    }
    for (const c of human.hand) {
      if (!seen.has(c.id)) {
        out.push(c);
        seen.add(c.id);
      }
    }
    return out;
  }, [order, handById, human.hand]);

  const sortHand = () => {
    Haptics.selectionAsync().catch(() => {});
    const ids = [...human.hand]
      .sort(
        (a, b) =>
          (SUIT_SORT[a.suit] ?? 9) - (SUIT_SORT[b.suit] ?? 9) ||
          (RANK_SORT[a.rank] ?? 0) - (RANK_SORT[b.rank] ?? 0)
      )
      .map((c) => c.id);
    setOrder(ids);
  };

  // Build touch handlers for the card at `index`. A quick tap plays/selects it
  // (via handlePress); a long-press or horizontal drag picks it up and drops it
  // at a new position. Reordering works on any turn — it's purely cosmetic.
  const makeCardHandlers = (index: number, card: Card) => {
    const endDrag = () => {
      const ds = dragRef.current;
      dragRef.current = null;
      if (ds?.timer) clearTimeout(ds.timer);
      setDragId(null);
      pan.setValue({ x: 0, y: 0 });
      return ds;
    };
    const ox = fanX(index);
    const oy = fanY(index);
    const startDrag = () => {
      const ds = dragRef.current;
      if (!ds || ds.started) return;
      if (ds.timer) clearTimeout(ds.timer);
      ds.started = true;
      setDragId(card.id);
      // Lift the card from exactly where it sits in the fan (no jump).
      pan.setValue({ x: ox, y: oy });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setValue({ x: ox, y: oy });
        const ds = {
          id: card.id,
          startIndex: index,
          started: false,
          timer: null as ReturnType<typeof setTimeout> | null,
          ox,
          oy,
        };
        dragRef.current = ds;
        ds.timer = setTimeout(startDrag, 160);
      },
      onPanResponderMove: (_e, g) => {
        const ds = dragRef.current;
        if (!ds) return;
        if (!ds.started) {
          // A deliberate move also starts the drag immediately.
          if (Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10) startDrag();
          else return;
        }
        pan.setValue({ x: ds.ox + g.dx, y: ds.oy + g.dy });
      },
      onPanResponderRelease: (_e, g) => {
        const ds = endDrag();
        if (!ds) return;
        if (!ds.started) {
          handlePress(card); // it was a tap
          return;
        }
        const ids = orderedHand.map((c) => c.id);
        if (ids.length < 2) return;
        const from = ids.indexOf(ds.id);
        if (from < 0) return;
        // Drop into the slot whose fan position is nearest the card's centre.
        const curX = ds.ox + g.dx;
        let target = 0;
        let best = Infinity;
        for (let j = 0; j < ids.length; j++) {
          const d = Math.abs(fanX(j) - curX);
          if (d < best) {
            best = d;
            target = j;
          }
        }
        if (target === from) return;
        ids.splice(from, 1);
        ids.splice(target, 0, ds.id);
        setOrder(ids);
      },
      onPanResponderTerminate: endDrag,
    }).panHandlers;
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={onExit} hitSlop={8}>
          <Text style={styles.exit}>✕ Exit</Text>
        </Pressable>
        <Text style={styles.turnLabel}>
          {state.phase === 'finished'
            ? 'Game over'
            : `${current.name}'s turn`}
        </Text>
        <View style={styles.topRight}>
          <Pressable onPress={toggleMute} hitSlop={8}>
            <Text style={styles.mute}>{muted ? '🔇' : '🔊'}</Text>
          </Pressable>
          <Text style={styles.dir}>{state.direction === 1 ? '↻' : '↺'}</Text>
        </View>
      </View>

      {/* Opponents */}
      <View style={styles.opponents}>
        {opponents.map((p) => {
          const active = p.id === current.id && state.phase === 'playing';
          return (
            <View
              key={p.id}
              style={[styles.opponent, active && styles.opponentActive]}
            >
              {floats?.[p.id] && (
                <View style={styles.oppBubble} pointerEvents="none">
                  <ChatBubble key={floats[p.id].id} text={floats[p.id].text} />
                </View>
              )}
              <Text style={styles.oppName} numberOfLines={1}>
                {p.name}
                {state.announcedKadi[p.id] ? ' · Kadi!' : ''}
              </Text>
              <View
                style={styles.oppCards}
                ref={(el) => {
                  oppRefs.current[p.id] = el;
                }}
              >
                {p.hand.slice(0, 5).map((c, i) => (
                  <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -22 }}>
                    <CardView faceDown size="sm" />
                  </View>
                ))}
              </View>
              <Text style={styles.oppCount}>{p.hand.length} cards</Text>
            </View>
          );
        })}
      </View>

      {/* Table */}
      <View style={styles.table}>
        <View style={styles.pileRow}>
          <Pressable
            ref={drawPileRef}
            onPress={() => isHumanTurn && onDraw()}
            style={styles.pileSlot}
          >
            <CardView faceDown size="lg" />
            <Text style={styles.pileLabel}>Draw ({state.drawPile.length})</Text>
          </Pressable>

          <View style={styles.pileSlot}>
            <View style={styles.topStack}>
              {/* Previous top peeks underneath while the new card slides in. */}
              {state.discardPile.length > 1 && (
                <View style={StyleSheet.absoluteFill}>
                  <CardView
                    card={state.discardPile[state.discardPile.length - 2]}
                    size="lg"
                  />
                </View>
              )}
              <Animated.View style={topCardStyle}>
                <CardView card={top} size="lg" />
              </Animated.View>
            </View>
            <Text style={styles.pileLabel}>Top</Text>
          </View>

          <View style={styles.pileSlot}>
            <View style={styles.suitBadge}>
              <Text
                style={[styles.suitBadgeText, { color: suitColor(state.activeSuit) }]}
              >
                {suitSymbol[state.activeSuit]}
              </Text>
            </View>
            <Text style={styles.pileLabel}>Suit</Text>
          </View>
        </View>

        {/* Status banners */}
        {state.pendingPenalty > 0 && (
          <View style={[styles.banner, styles.bannerDanger]}>
            <Text style={styles.bannerText}>
              ⚠ Penalty: pick {state.pendingPenalty} — or counter / block with an
              Ace
            </Text>
          </View>
        )}
        {state.questionSuit && (
          <View style={[styles.banner, styles.bannerInfo]}>
            <Text style={styles.bannerText}>
              ❓ Answer with {suitSymbol[state.questionSuit]}{' '}
              {state.questionSuit}
            </Text>
          </View>
        )}
        {state.skipCount > 0 && (
          <View style={[styles.banner, styles.bannerWarn]}>
            <Text style={styles.bannerText}>
              ⤵ Jack skip ×{state.skipCount}!{' '}
              {isHumanTurn
                ? 'Play your own Jack to bounce it, or take the skip.'
                : `${current.name} must respond.`}
            </Text>
          </View>
        )}
        {!!feedback && (
          <View style={[styles.banner, styles.bannerDanger]}>
            <Text style={styles.bannerText}>🚫 {feedback}</Text>
          </View>
        )}

        {/* Log */}
        <View style={styles.logBox}>
          <Text style={styles.logText} numberOfLines={1}>
            {state.log[state.log.length - 1]}
          </Text>
        </View>
      </View>

      {/* Human hand */}
      <View style={styles.handArea}>
        {floats?.[human.id] && (
          <View style={styles.selfBubble} pointerEvents="none">
            <ChatBubble key={floats[human.id].id} text={floats[human.id].text} />
          </View>
        )}
        <View style={styles.handHeader}>
          <Text style={styles.handTitle}>
            {human.name} · {human.hand.length} cards
            {state.announcedKadi[human.id] ? ' · Kadi!' : ''}
          </Text>
          <View style={styles.handHeaderRight}>
            {human.hand.length > 1 && (
              <Pressable style={styles.sortBtn} onPress={sortHand} hitSlop={6}>
                <Text style={styles.sortBtnText}>Sort ⇄</Text>
              </Pressable>
            )}
            {canAnnounce && (
              <Animated.View style={{ transform: [{ scale: pulse }] }}>
                <Pressable style={styles.kadiBtn} onPress={onAnnounceKadi}>
                  <Text style={styles.kadiBtnText}>Niko Kadi! 🔔</Text>
                </Pressable>
              </Animated.View>
            )}
          </View>
        </View>

        <View ref={handRef} style={[styles.hand, { height: fanHeight }]}>
          {orderedHand.map((c, i) => {
            const selOrder = selected.indexOf(c.id);
            const isSel = selOrder >= 0;
            const addable =
              assisted && isHumanTurn && !isSel && canAddCard(c);
            const highlight = isSel || addable;
            const lift = isSel ? 38 : addable ? 18 : 0;
            const isDragging = dragId === c.id;
            const angle = (i - fanMid) * anglePer;
            return (
              <Animated.View
                key={c.id}
                {...makeCardHandlers(i, c)}
                style={{
                  position: 'absolute',
                  left: handLeft,
                  bottom: fanBottom,
                  zIndex: isDragging ? 999 : i,
                  elevation: isDragging ? 12 : i,
                  // While dragged the card follows the finger upright; otherwise
                  // it sits in the fan, rotating around the shared pivot below.
                  transformOrigin: isDragging
                    ? ['50%', '50%', 0]
                    : ['50%', `${FAN_ORIGIN_PCT}%`, 0],
                  transform: isDragging
                    ? [{ translateX: pan.x }, { translateY: pan.y }, { scale: 1.06 }]
                    : [{ rotate: `${angle}deg` }, { translateY: -lift }],
                }}
              >
                <CardView
                  card={c}
                  size="lg"
                  playable={highlight}
                  dimmed={assisted && isHumanTurn && !highlight && !isDragging}
                />
                {isSel && (
                  <View style={styles.selBadge}>
                    <Text style={styles.selBadgeText}>{selOrder + 1}</Text>
                  </View>
                )}
              </Animated.View>
            );
          })}
        </View>

        {/* Interaction footer */}
        {isHumanTurn && state.skipCount > 0 && (
          <View style={styles.skipRow}>
            {human.hand.some((c) => c.rank === 'J' && human.hand.length > 1) && (
              <Text style={styles.hint}>Play a Jack to bounce, or…</Text>
            )}
            <Pressable style={styles.skipBtn} onPress={onSkipTurn}>
              <Text style={styles.skipBtnText}>Take the skip ⤵</Text>
            </Pressable>
          </View>
        )}

        {isHumanTurn && state.skipCount === 0 && (
          selected.length > 0 ? (
            <View style={styles.commitBar}>
              <Pressable onPress={() => setSelected([])} hitSlop={8}>
                <Text style={styles.clearBtn}>Clear</Text>
              </Pressable>
              <Pressable
                style={[styles.playBtn, blockedWin && styles.playBtnDisabled]}
                onPress={commit}
                disabled={blockedWin}
              >
                <Text style={styles.playBtnText}>
                  {blockedWin
                    ? state.announcedKadi[human.id]
                      ? 'Win on your next turn'
                      : 'Declare Niko Kadi! first'
                    : `Play${selected.length > 1 ? ` ${selected.length} cards` : ''} ▶`}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.hint}>
              {human.hand.some((c) => isPlayable(state, c))
                ? cleanTurn
                  ? 'Tap a card to play — or tap several to throw a chain'
                  : 'Tap a highlighted card'
                : 'No playable card — tap the draw pile to pick'}
            </Text>
          )
        )}
      </View>

      {/* Winner overlay */}
      {state.phase === 'finished' && (
        <View style={styles.winOverlayWrap} pointerEvents="box-none">
          <Animated.View
            style={[styles.winOverlay, { transform: [{ scale: winPop }] }]}
          >
            <Text style={styles.winTitle}>
              {state.winnerId === human.id
                ? '🎉 You win!'
                : `${state.players.find((p) => p.id === state.winnerId)?.name} wins`}
            </Text>

            {onRematch && !rematch?.cannot && (
              <>
                {rematch && rematch.readyCount > 0 && !rematch.mineAccepted && (
                  <Text style={styles.rematchHint}>
                    {rematch.requesterName
                      ? `${rematch.requesterName} wants a rematch`
                      : 'Rematch?'}
                  </Text>
                )}
                {rematch?.mineAccepted ? (
                  <View style={[styles.winBtn, styles.winBtnGhost]}>
                    <Text style={styles.winBtnText}>
                      Waiting… {rematch.readyCount}/{rematch.total}
                    </Text>
                  </View>
                ) : (
                  <Pressable style={styles.rematchBtn} onPress={onRematch}>
                    <Text style={styles.rematchBtnText}>
                      🔁 Rematch{rematch && rematch.readyCount > 0
                        ? ` (${rematch.readyCount}/${rematch.total})`
                        : ''}
                    </Text>
                  </Pressable>
                )}
              </>
            )}

            <Pressable style={styles.winBtn} onPress={onExit}>
              <Text style={styles.winBtnText}>{exitLabel}</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}

      {/* Flying-card draw animation (above the board, below modals). */}
      <FlyingCardsOverlay ref={overlayRef} flights={flights} onDone={remove} />

      <SuitPicker
        visible={acePicker !== null}
        onPick={(s) => {
          if (acePicker?.mode === 'single') onPlay(acePicker.cardId, s);
          else if (acePicker?.mode === 'commit') doCommit(s);
          setAcePicker(null);
        }}
        onCancel={() => setAcePicker(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.felt },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  exit: { color: colors.textMuted, fontWeight: '700' },
  turnLabel: { color: colors.text, fontWeight: '800', fontSize: 16 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mute: { fontSize: 18 },
  dir: { color: colors.gold, fontSize: 22, fontWeight: '800', width: 24, textAlign: 'right' },
  opponents: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 8,
  },
  opponent: {
    alignItems: 'center',
    backgroundColor: colors.feltDark,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 92,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  opponentActive: { borderColor: colors.gold },
  oppName: { color: colors.text, fontWeight: '700', maxWidth: 100 },
  oppCards: { flexDirection: 'row', marginVertical: 4, height: 66 },
  oppCount: { color: colors.textMuted, fontSize: 12 },
  oppBubble: {
    position: 'absolute',
    top: -40,
    left: -20,
    right: -20,
    alignItems: 'center',
    zIndex: 50,
  },
  selfBubble: {
    position: 'absolute',
    top: -36,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  table: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  pileRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 22,
  },
  pileSlot: { alignItems: 'center', gap: 6 },
  topStack: { width: 92, height: 132 },
  pileLabel: { color: colors.textMuted, fontSize: 12 },
  suitBadge: {
    width: 92,
    height: 132,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 2,
    borderColor: colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suitBadgeText: { fontSize: 48, fontWeight: '800' },
  banner: {
    marginTop: 16,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'center',
  },
  bannerDanger: { backgroundColor: 'rgba(231,76,60,0.9)' },
  bannerInfo: { backgroundColor: 'rgba(41,128,185,0.9)' },
  bannerWarn: { backgroundColor: 'rgba(243,156,18,0.95)' },
  bannerText: { color: '#fff', fontWeight: '700' },
  logBox: { marginTop: 14, alignSelf: 'center', maxWidth: '92%' },
  logText: { color: colors.textMuted, fontStyle: 'italic' },
  handArea: {
    backgroundColor: colors.feltDark,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 18,
  },
  handHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  handTitle: { color: colors.text, fontWeight: '800' },
  handHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortBtn: {
    backgroundColor: colors.feltDark,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  sortBtnText: { color: colors.gold, fontWeight: '800', fontSize: 13 },
  kadiBtn: {
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  kadiBtnText: { color: colors.black, fontWeight: '900' },
  declareBar: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 8,
    alignItems: 'center',
  },
  declareHint: {
    color: colors.text,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  declareBtn: {
    backgroundColor: colors.gold,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  declareBtnText: {
    color: colors.black,
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  hand: {
    position: 'relative',
    width: '100%',
    alignSelf: 'stretch',
  },
  hint: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    fontSize: 13,
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 10,
  },
  skipBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  skipBtnText: { color: '#fff', fontWeight: '800' },
  selBadge: {
    position: 'absolute',
    top: -8,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#fff',
  },
  selBadgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  commitBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginTop: 10,
  },
  clearBtn: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  playBtn: {
    backgroundColor: colors.gold,
    paddingHorizontal: 26,
    paddingVertical: 10,
    borderRadius: 24,
  },
  playBtnDisabled: { backgroundColor: 'rgba(244,197,66,0.45)' },
  playBtnText: { color: colors.black, fontWeight: '900', fontSize: 16 },
  winOverlayWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  winOverlay: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    gap: 18,
  },
  winTitle: { fontSize: 24, fontWeight: '900', color: colors.black },
  winBtn: {
    backgroundColor: colors.felt,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
  },
  winBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  winBtnGhost: { backgroundColor: colors.feltDark, opacity: 0.85 },
  rematchHint: { fontSize: 15, fontWeight: '700', color: colors.black, marginTop: -4 },
  rematchBtn: {
    backgroundColor: colors.gold,
    paddingHorizontal: 26,
    paddingVertical: 13,
    borderRadius: 24,
  },
  rematchBtnText: { color: colors.black, fontWeight: '900', fontSize: 17 },
});
