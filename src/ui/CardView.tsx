import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../game/types';
import { colors, suitColor, suitSymbol } from './theme';

interface Props {
  card?: Card; // omit for a face-down card
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  playable?: boolean;
  dimmed?: boolean;
  onPress?: () => void;
}

const SIZES = {
  sm: { w: 46, h: 66, font: 16, pip: 20 },
  md: { w: 66, h: 94, font: 22, pip: 30 },
  lg: { w: 92, h: 132, font: 30, pip: 44 },
};

export function CardView({
  card,
  size = 'md',
  faceDown,
  playable,
  dimmed,
  onPress,
}: Props) {
  const s = SIZES[size];

  if (faceDown || !card) {
    return (
      <View
        style={[
          styles.card,
          { width: s.w, height: s.h, backgroundColor: colors.cardBack },
        ]}
      >
        <View style={styles.backPattern} />
      </View>
    );
  }

  const col = suitColor(card.suit);
  const sym = suitSymbol[card.suit];

  const body = (
    <View
      style={[
        styles.card,
        { width: s.w, height: s.h },
        playable && styles.playable,
        dimmed && styles.dimmed,
      ]}
    >
      <Text style={[styles.corner, { color: col, fontSize: s.font }]}>
        {card.rank}
        {sym}
      </Text>
      <Text style={[styles.pip, { color: col, fontSize: s.pip }]}>{sym}</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} disabled={dimmed} hitSlop={4}>
        {body}
      </Pressable>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    padding: 4,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  playable: {
    borderColor: colors.gold,
    borderWidth: 2,
    shadowColor: colors.gold,
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  dimmed: {
    opacity: 0.45,
  },
  corner: {
    fontWeight: '800',
  },
  pip: {
    alignSelf: 'center',
    fontWeight: '700',
  },
  backPattern: {
    flex: 1,
    margin: 5,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.cardBackPattern,
    backgroundColor: 'transparent',
  },
});
