import React, { useEffect, useState } from 'react';
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
import {
  TournamentSummary,
  TournamentTableInfo,
} from '../api/tournaments';
import { OnlineGameScreen } from './OnlineGameScreen';
import { sortStandings, standingLabel } from './tournamentStandings';
import { useTournament } from './useTournament';
import { colors } from './theme';

interface Props {
  tournamentId: string;
  initial?: TournamentSummary | null;
  onExit: () => void;
}

function formatLabel(t: TournamentSummary): string {
  if (t.format === 'league') return `League · ${t.roundsTotal ?? 3} rounds`;
  if (t.format === 'survival') return 'Survival';
  return 'Knockout';
}

export function TournamentScreen({ tournamentId, initial, onExit }: Props) {
  const { user } = useAuth();
  const {
    summary,
    myMatchId,
    tableRosters,
    tables,
    finished,
    myStatus,
    selfUserId,
    start,
    leave,
    refresh,
  } = useTournament({ tournamentId, initial });

  // The table the player is currently sitting at (null = on the board).
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  // A running table the player peeked away from — don't auto-yank them back.
  const [dismissedMatchId, setDismissedMatchId] = useState<string | null>(null);

  // Auto-enter a newly-ready table: being "present" means the in-table turn
  // timeout covers anyone who drops, so a no-show can't stall the round. A table
  // you deliberately backed out of isn't re-entered until a new one is seated.
  useEffect(() => {
    if (!myMatchId || activeMatchId || myMatchId === dismissedMatchId) return;
    setActiveMatchId(myMatchId);
  }, [myMatchId, activeMatchId, dismissedMatchId]);

  // Inside a table → hand off to the normal online game screen.
  if (activeMatchId) {
    return (
      <OnlineGameScreen
        key={activeMatchId}
        matchId={activeMatchId}
        roster={tableRosters[activeMatchId] ?? []}
        tournamentMode
        standings={summary ? { summary, selfUserId } : null}
        onExit={() => {
          setDismissedMatchId(activeMatchId);
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
  const standings = sortStandings(summary.players);
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
            {formatLabel(summary)} · up to {summary.tableSize}/table
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
              <Text style={styles.bannerTitle}>
                Round {summary.currentRound}
                {summary.format === 'league' ? ` of ${summary.roundsTotal ?? 3}` : ''}
              </Text>
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
                <Text style={styles.rowTag}>{standingLabel(p, summary)}</Text>
              </View>
            );
          })}
        </View>

        {/* ---- Bracket / rounds ---- */}
        {tables.length > 0 && <BracketView tables={tables} selfUserId={selfUserId} />}

        {summary.status === 'finished' && (
          <Pressable style={styles.primary} onPress={onExit}>
            <Text style={styles.primaryText}>Done</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Groups every table by round into a compact bracket view: each table lists its
// seats, the winner crowned, and the rest dimmed.
function BracketView({
  tables,
  selfUserId,
}: {
  tables: TournamentTableInfo[];
  selfUserId: number;
}) {
  const byRound = new Map<number, TournamentTableInfo[]>();
  for (const t of tables) {
    const list = byRound.get(t.round) ?? [];
    list.push(t);
    byRound.set(t.round, list);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);

  return (
    <View style={styles.bracket}>
      <Text style={styles.listTitle}>Bracket</Text>
      {rounds.map((r) => (
        <View key={r} style={styles.bracketRound}>
          <Text style={styles.bracketRoundLabel}>Round {r}</Text>
          {(byRound.get(r) ?? []).map((tbl, i) => (
            <View key={i} style={styles.bracketTable}>
              {tbl.players.map((p) => {
                const won = tbl.winnerUserId === p.userId;
                return (
                  <Text
                    key={p.userId}
                    style={[
                      styles.bracketName,
                      won && styles.bracketWinner,
                      !won && tbl.status === 'finished' && styles.bracketLoser,
                      p.userId === selfUserId && styles.bracketSelf,
                    ]}
                  >
                    {won ? '👑 ' : ''}
                    {p.name}
                  </Text>
                );
              })}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
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
  bracket: {
    backgroundColor: colors.feltDark,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  bracketRound: { gap: 8 },
  bracketRoundLabel: {
    color: colors.textMuted,
    fontWeight: '800',
    fontSize: 13,
    textTransform: 'uppercase',
  },
  bracketTable: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  bracketName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  bracketWinner: { color: colors.gold, fontWeight: '900' },
  bracketLoser: { color: colors.textMuted, textDecorationLine: 'line-through' },
  bracketSelf: { fontStyle: 'italic' },
});
