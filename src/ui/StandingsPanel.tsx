import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TournamentSummary } from '../api/tournaments';
import { sortStandings, standingLabel } from './tournamentStandings';
import { colors } from './theme';

interface Props {
  summary: TournamentSummary;
  selfUserId: number;
}

// Sub-line under the title: how far through the tournament we are.
function progressLabel(t: TournamentSummary): string {
  if (t.status === 'finished') return 'Final standings';
  if (t.status === 'registering') return 'Waiting to start';
  if (t.format === 'league') {
    return `Round ${t.currentRound} of ${t.roundsTotal ?? 3}`;
  }
  return `Round ${t.currentRound}`;
}

/**
 * Floating standings button (bottom-left) + slide-up scoreboard, so a player at
 * a tournament table can peek at the live standings without leaving the game.
 * Mirrors {@link ChatPanel}, sitting opposite the chat FAB.
 */
export function StandingsPanel({ summary, selfUserId }: Props) {
  const [open, setOpen] = useState(false);
  const standings = sortStandings(summary.players);

  return (
    <>
      <View style={styles.fabWrap} pointerEvents="box-none">
        <Pressable style={styles.fab} onPress={() => setOpen(true)} hitSlop={10}>
          <Text style={styles.fabIcon}>🏆</Text>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Standings</Text>
                <Text style={styles.sub}>{progressLabel(summary)}</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
            >
              {standings.map((p, i) => {
                const isSelf = p.userId === selfUserId;
                return (
                  <View
                    key={p.userId}
                    style={[styles.row, isSelf && styles.rowSelf]}
                  >
                    <Text style={styles.rank}>{i + 1}</Text>
                    <Text
                      style={[styles.name, isSelf && styles.nameSelf]}
                      numberOfLines={1}
                    >
                      {p.name}
                      {isSelf ? ' (you)' : ''}
                    </Text>
                    <Text style={styles.tag}>{standingLabel(p, summary)}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabWrap: { position: 'absolute', left: 16, bottom: 28 },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.feltDark,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: { fontSize: 24 },

  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: colors.feltDark,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 16,
    maxHeight: '72%',
    borderTopWidth: 2,
    borderColor: colors.gold,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  title: { color: colors.gold, fontWeight: '800', fontSize: 18 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  close: { color: colors.text, fontWeight: '800', fontSize: 18 },

  list: { paddingHorizontal: 12 },
  listContent: { paddingVertical: 8, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  rowSelf: { borderWidth: 1.5, borderColor: colors.gold },
  rank: {
    color: colors.textMuted,
    fontWeight: '900',
    fontSize: 15,
    width: 22,
  },
  name: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 15 },
  nameSelf: { color: colors.gold },
  tag: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
});
