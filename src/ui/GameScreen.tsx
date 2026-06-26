import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  canStartSequence,
  cardsConnect,
  isPlayable,
  topCard,
} from '../game/rules';
import { Card, GameState, Suit } from '../game/types';
import { CardView } from './CardView';
import { getMuted, setMuted } from './sound';
import { SuitPicker } from './SuitPicker';
import { colors, suitColor, suitSymbol } from './theme';
import { HUMAN_ID } from './useGame';

// Width of a large card (must match CardView's `lg` size).
const HAND_CARD_W = 92;
const HAND_GAP = 8; // ideal gap between cards when they all fit

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
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [acePicker, setAcePicker] = useState<AcePicker>(null);

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
    if (!isHumanTurn || !cleanTurn || state.awaitingAnnounce) setSelected([]);
  }, [isHumanTurn, cleanTurn, state.awaitingAnnounce, state.currentPlayerIndex]);

  const selectedCards = selected
    .map((id) => human.hand.find((c) => c.id === id))
    .filter((c): c is Card => !!c);

  // Fan the hand: spread cards evenly, overlapping as needed so they all fit.
  const { width: screenW } = useWindowDimensions();
  const handCount = human.hand.length;
  const available = screenW - 24; // leave a little side padding
  const fullStep = HAND_CARD_W + HAND_GAP;
  const step =
    handCount > 1
      ? Math.min(fullStep, (available - HAND_CARD_W) / (handCount - 1))
      : 0;
  const overlapMargin = step - HAND_CARD_W; // negative when overlapping

  // Can this card be added to the current selection?
  const canAddCard = (card: Card): boolean => {
    if (selected.length === 0) return isPlayable(state, card);
    return cardsConnect(selectedCards[selectedCards.length - 1], card);
  };

  // A selection that uses the whole hand is a winning throw — in assisted mode
  // we block it until "Kadi" is declared; in manual mode the engine rejects it.
  const selectionWins = selected.length > 0 && selected.length === human.hand.length;
  const blockedWin = assisted && selectionWins && !state.announcedKadi[human.id];

  const handlePress = (card: Card) => {
    if (!isHumanTurn || state.awaitingAnnounce) return;
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
  // sets awaitingAnnounce). Declaring passes your turn — opponents get one chance
  // to block before you can finish on your next turn.
  const canAnnounce = isHumanTurn && state.awaitingAnnounce;

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
              <Text style={styles.oppName} numberOfLines={1}>
                {p.name}
                {state.announcedKadi[p.id] ? ' · Kadi!' : ''}
              </Text>
              <View style={styles.oppCards}>
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
            onPress={() => isHumanTurn && !state.awaitingAnnounce && onDraw()}
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
        <View style={styles.handHeader}>
          <Text style={styles.handTitle}>
            {human.name} · {human.hand.length} cards
            {state.announcedKadi[human.id] ? ' · Kadi!' : ''}
          </Text>
          {canAnnounce && (
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <Pressable style={styles.kadiBtn} onPress={onAnnounceKadi}>
                <Text style={styles.kadiBtnText}>Niko Kadi! 🔔</Text>
              </Pressable>
            </Animated.View>
          )}
        </View>

        <View style={styles.hand}>
          {human.hand.map((c, i) => {
            const selOrder = selected.indexOf(c.id);
            const isSel = selOrder >= 0;
            const addable =
              assisted &&
              isHumanTurn &&
              !state.awaitingAnnounce &&
              !isSel &&
              canAddCard(c);
            const highlight = isSel || addable;
            const lift = isSel ? -34 : addable ? -16 : 0;
            return (
              <View
                key={c.id}
                style={{
                  marginLeft: i === 0 ? 0 : overlapMargin,
                  zIndex: i,
                  transform: [{ translateY: lift }],
                }}
              >
                <CardView
                  card={c}
                  size="lg"
                  playable={highlight}
                  dimmed={assisted && isHumanTurn && !highlight}
                  onPress={() => handlePress(c)}
                />
                {isSel && (
                  <View style={styles.selBadge}>
                    <Text style={styles.selBadgeText}>{selOrder + 1}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Interaction footer */}
        {isHumanTurn && state.awaitingAnnounce && (
          <View style={styles.declareBar}>
            <Text style={styles.declareHint}>
              You can win! Declare Niko Kadi to warn the table — you finish on
              your next turn.
            </Text>
            <Animated.View
              style={{ transform: [{ scale: pulse }], alignSelf: 'stretch' }}
            >
              <Pressable style={styles.declareBtn} onPress={onAnnounceKadi}>
                <Text style={styles.declareBtnText}>🔔 Niko Kadi!</Text>
              </Pressable>
            </Animated.View>
          </View>
        )}

        {isHumanTurn && !state.awaitingAnnounce && state.skipCount > 0 && (
          <View style={styles.skipRow}>
            {human.hand.some((c) => c.rank === 'J' && human.hand.length > 1) && (
              <Text style={styles.hint}>Play a Jack to bounce, or…</Text>
            )}
            <Pressable style={styles.skipBtn} onPress={onSkipTurn}>
              <Text style={styles.skipBtnText}>Take the skip ⤵</Text>
            </Pressable>
          </View>
        )}

        {isHumanTurn && !state.awaitingAnnounce && state.skipCount === 0 && (
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
                    ? 'Declare Niko Kadi! first'
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
            <Pressable style={styles.winBtn} onPress={onExit}>
              <Text style={styles.winBtnText}>Back to menu</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}

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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 20, // headroom for lifted (playable) cards
    minHeight: 156,
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
});
