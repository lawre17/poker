import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Suit, SUITS } from '../game/types';
import { colors, suitColor, suitSymbol } from './theme';

interface Props {
  visible: boolean;
  onPick: (suit: Suit) => void;
  onCancel: () => void;
}

export function SuitPicker({ visible, onPick, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Change suit to…</Text>
          <View style={styles.row}>
            {SUITS.map((s) => (
              <Pressable key={s} style={styles.suit} onPress={() => onPick(s)}>
                <Text style={[styles.symbol, { color: suitColor(s) }]}>
                  {suitSymbol[s]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    width: 300,
    maxWidth: '88%',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.black,
    marginBottom: 16,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  suit: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  symbol: {
    fontSize: 34,
    fontWeight: '800',
  },
});
