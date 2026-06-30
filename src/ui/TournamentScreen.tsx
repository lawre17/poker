import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../api/auth';
import { TournamentPlayerSummary, TournamentSummary } from '../api/tournaments';
import { OnlineGameScreen } from './OnlineGameScreen';
import { useTournament } from './useTournament';
import { colors } from './theme';

interface Props {
  tournamentId: string;
  initial?: TournamentSummary | null;
  onExit: () => void;
}

// Sort for the standings list: champion first, then players still in, then the
// eliminated by how far they got (later round = higher).
function rank(p: TournamentPlayerSummary): number {
  if (p.status === 'champion') return 100000;
  if (p.status === 'active' || p.status === 'registered') return 50000;
  return p.eliminatedRound ?? 0;
}

export function TournamentScreen({ tournamentId, initial, onExit }: Props) {
  const { user } = useAuth();
  const {
    summary,
    myMatchId,
    tableRosters,
    finished,
    myStatus,
    selfUserId,
    start,
    leave,
    refresh,
  } = useTournament({ tournamentId, initial });

  // The table the player is currently sitting at (null = on the board).
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  // Inside a table → hand off to the normal online game screen.
  if (activeMatchId) {
    return (
      <OnlineGameScreen
        key={activeMatchId}
        matchId={activeMatchId}
        roster={tableRosters[activeMatchId] ?? []}
        tournamentMode
        onExit={() => {
          setActiveMatchId(null);
          refresh();
        }}
      />
    );
  }

  const confirmExit = () => {
    if (!summary || summary.status === 'finished') {
      onExit();
      return;
    }
    Alert.alert(
      'Leave tournament?',
      summary.status === 'registering'
        ? 'You will be removed from the tournament.'
        : "You'll forfeit your remaining games.",
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            void leave();
            onExit();
          },
        },
      ]
    );
  };

  if (!summary) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} size="large" />
          <Text style={styles.muted}>Loading tournament…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isHost = user != null && Number(user.id) === summary.hostUserId;
  const standings = summary.players.slice().sort((a, b) => rank(b) - rank(a));
  const champ =
    finished ?? null;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={confirmExit} hitSlop={8}>
            <Text style={styles.back}>‹ Leave</Text>
          </Pressable>
          <Text style={styles.title}>Tournament</Text>
          <View style={{ width: 50 }} />
        </View>

        <View style={styles.codeBadge}>
          <Text style={styles.codeLabel}>CODE</Text>
          <Text style={styles.codeValue}>{summary.code}</Text>
          <Text style={styles.codeSub}>
            {summary.format === 'bracket' ? 'Knockout' : summary.format} · up to{' '}
            {summary.tableSize}/table
          </Text>
          {summary.buyIn > 0 && (
            <Text style={styles.pot}>
              Entry 🪙 {summary.buyIn} · Pot 🪙 {summary.prizePool}
            </Text>
          )}
        </View>

        {/* ---- Status banner ---- */}
        {summary.status === 'registering' && (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Waiting for players…</Text>
            <Text style={styles.muted}>
              Share the code. {isHost ? 'Start when everyone has joined.' : 'The host will start soon.'}
            </Text>
          </View>
        )}

        {summary.status === 'running' && myStatus === 'eliminated' && (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>You're knocked out</Text>
            <Text style={styles.muted}>Stick around to see who takes it.</Text>
          </View>
        )}

        {summary.status === 'running' &&
          myStatus !== 'eliminated' &&
          (myMatchId ? (
            <View style={[styles.banner, styles.bannerHot]}>
              <Text style={styles.bannerTitle}>Your table is ready!</Text>
              <Pressable
                style={styles.enterBtn}
                onPress={() => setActiveMatchId(myMatchId)}
              >
                <Text style={styles.enterBtnText}>Enter table ▶</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>Round {summary.currentRound}</Text>
              <View style={styles.rowCenter}>
                <ActivityIndicator color={colors.gold} />
                <Text style={styles.muted}>Waiting for your next table…</Text>
              </View>
            </View>
          ))}

        {summary.status === 'finished' &&
          (summary.winnerUserId == null ? (
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>Tournament cancelled</Text>
              {summary.buyIn > 0 && (
                <Text style={styles.muted}>Buy-ins have been refunded.</Text>
              )}
            </View>
          ) : (
            <View style={[styles.banner, styles.bannerWin]}>
              <Text style={styles.trophy}>🏆</Text>
              <Text style={styles.bannerTitle}>
                {champ?.winnerName ??
                  summary.players.find((p) => p.status === 'champion')?.name ??
                  'Champion'}{' '}
                wins!
              </Text>
              {(champ?.prize ?? summary.prizePool) > 0 && (
                <Text style={styles.muted}>
                  Prize: 🪙 {champ?.prize ?? summary.prizePool}
                </Text>
              )}
            </View>
          ))}

        {/* ---- Host start ---- */}
        {summary.status === 'registering' && isHost && (
          <Pressable
            style={[
              styles.primary,
              summary.players.length < 2 && styles.primaryDisabled,
            ]}
            onPress={() => summary.players.length >= 2 && start()}
            disabled={summary.players.length < 2}
          >
            <Text style={styles.primaryText}>
              Start tournament ({summary.players.length})
            </Text>
          </Pressable>
        )}

        {/* ---- Standings ---- */}
        <View style={styles.listBox}>
          <Text style={styles.listTitle}>
            Players ({summary.players.length})
          </Text>
          {standings.map((p) => {
            const isSelf = p.userId === selfUserId;
            return (
              <View key={p.userId} style={styles.row}>
                <Text style={[styles.rowName, isSelf && styles.rowSelf]}>
                  {p.name}
                  {isSelf ? ' (you)' : ''}
                </Text>
                <Text style={styles.rowTag}>{statusLabel(p, summary)}</Text>
              </View>
            );
          })}
        </View>

        {summary.status === 'finished' && (
          <Pressable style={styles.primary} onPress={onExit}>
            <Text style={styles.primaryText}>Done</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function statusLabel(
  p: TournamentPlayerSummary,
  t: TournamentSummary
): string {
  switch (p.status) {
    case 'champion':
      return '🏆 Champion';
    case 'eliminated':
      return p.eliminatedRound ? `Out · R${p.eliminatedRound}` : 'Out';
    case 'active':
      return t.status === 'running' ? `In · R${t.currentRound}` : 'In';
    default:
      return 'Ready';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.felt },
  content: { padding: 20, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { color: colors.textMuted, fontWeight: '700', fontSize: 16, width: 60 },
  title: { color: colors.gold, fontWeight: '900', fontSize: 22 },
  muted: { color: colors.textMuted, fontSize: 14 },
  codeBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 2,
  },
  codeLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  codeValue: {
    color: colors.gold,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 8,
  },
  codeSub: { color: colors.textMuted, fontSize: 12 },
  pot: { color: colors.gold, fontSize: 13, fontWeight: '800', marginTop: 2 },
  banner: {
    backgroundColor: colors.feltDark,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  bannerHot: { borderWidth: 2, borderColor: colors.gold },
  bannerWin: { borderWidth: 2, borderColor: colors.gold },
  bannerTitle: { color: colors.text, fontWeight: '900', fontSize: 18 },
  trophy: { fontSize: 44 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  enterBtn: {
    backgroundColor: colors.gold,
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 26,
    marginTop: 4,
  },
  enterBtnText: { color: colors.black, fontSize: 18, fontWeight: '900' },
  primary: {
    backgroundColor: colors.gold,
    paddingVertical: 14,
    borderRadius: 26,
    alignItems: 'center',
  },
  primaryDisabled: { backgroundColor: 'rgba(244,197,66,0.55)' },
  primaryText: { color: colors.black, fontSize: 17, fontWeight: '900' },
  listBox: {
    backgroundColor: colors.feltDark,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  listTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  rowName: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowSelf: { color: colors.gold },
  rowTag: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
});
