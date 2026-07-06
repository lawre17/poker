import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Rank, RANKS } from '../game/types';
import { colors } from './theme';

interface Props {
  visible: boolean;
  onPick: (rank: Rank) => void;
  onCancel: () => void;
}

// Picks the rank to demand when stacking 2+ Aces (the aceDemand rule).
export function RankPicker({ visible, onPick, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Demand a rank…</Text>
          <Text style={styles.subtitle}>
            Everyone must play it or draw until it comes back to you.
          </Text>
          <View style={styles.grid}>
            {RANKS.map((r) => (
              <Pressable key={r} style={styles.rank} onPress={() => onPick(r)}>
                <Text style={styles.rankText}>{r}</Text>
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
    width: 320,
    maxWidth: '90%',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.black,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  rank: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.black,
  },
});
