import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../api/auth';
import { ApiError } from '../api/client';
import {
  createTournament,
  joinTournament,
  TournamentFormat,
  TournamentSummary,
} from '../api/tournaments';
import { colors } from './theme';

interface Props {
  onExit: () => void;
  onEnter: (tournament: TournamentSummary) => void;
}

// Buy-in presets (coins). 0 = free to enter.
const BUY_INS = [0, 50, 100, 250, 500];

const FORMATS: {
  key: TournamentFormat;
  label: string;
  blurb: string;
}[] = [
  {
    key: 'bracket',
    label: 'Knockout',
    blurb: "Each table's winner advances; lose once and you're out.",
  },
  {
    key: 'league',
    label: 'League',
    blurb: 'Play several rounds, earn points by finish. Highest total wins.',
  },
  {
    key: 'survival',
    label: 'Survival',
    blurb: 'The bottom half of each table drops; survivors regroup.',
  },
];

// League: how many rounds everyone plays.
const ROUND_COUNTS = [3, 5, 7, 10, 15];

export function TournamentLobbyScreen({ onExit, onEnter }: Props) {
  const { user, refreshMe } = useAuth();
  const [format, setFormat] = useState<TournamentFormat>('bracket');
  const [tableSize, setTableSize] = useState(4);
  const [buyIn, setBuyIn] = useState(0);
  const [roundsTotal, setRoundsTotal] = useState(3);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coins = user?.coins ?? 0;
  const blurb = FORMATS.find((f) => f.key === format)?.blurb ?? '';

  const handleCreate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const t = await createTournament({
        format,
        tableSize,
        buyIn,
        ...(format === 'league' ? { roundsTotal } : {}),
      });
      await refreshMe();
      onEnter(t);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the tournament.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (busy) return;
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) {
      setError('Enter the tournament code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const t = await joinTournament(c);
      await refreshMe();
      onEnter(t);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not join that tournament.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={onExit} hitSlop={8}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Tournaments 🏆</Text>
          <Text style={styles.wallet}>🪙 {coins}</Text>
        </View>

        {!!error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create a tournament</Text>

          <Text style={styles.label}>Format</Text>
          <View style={styles.choices}>
            {FORMATS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setFormat(f.key)}
                style={[styles.fmt, format === f.key && styles.fmtActive]}
              >
                <Text
                  style={[styles.fmtText, format === f.key && styles.fmtTextActive]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>{blurb}</Text>

          {format === 'league' && (
            <>
              <Text style={styles.label}>Rounds</Text>
              <View style={styles.choices}>
                {ROUND_COUNTS.map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setRoundsTotal(n)}
                    style={[styles.choice, roundsTotal === n && styles.choiceActive]}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        roundsTotal === n && styles.choiceTextActive,
                      ]}
                    >
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>Players per table</Text>
          <View style={styles.choices}>
            {[2, 3, 4, 5, 6].map((n) => (
              <Pressable
                key={n}
                onPress={() => setTableSize(n)}
                style={[styles.choice, tableSize === n && styles.choiceActive]}
              >
                <Text
                  style={[
                    styles.choiceText,
                    tableSize === n && styles.choiceTextActive,
                  ]}
                >
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            Players are seated into tables of up to {tableSize}. Each table's
            winner advances; the last player standing takes the title.
          </Text>

          <Text style={styles.label}>Buy-in</Text>
          <View style={styles.choices}>
            {BUY_INS.map((n) => (
              <Pressable
                key={n}
                onPress={() => setBuyIn(n)}
                style={[styles.buyIn, buyIn === n && styles.choiceActive]}
              >
                <Text
                  style={[styles.buyInText, buyIn === n && styles.choiceTextActive]}
                >
                  {n === 0 ? 'Free' : `🪙 ${n}`}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            {buyIn === 0
              ? 'Free to enter — just for bragging rights.'
              : `Everyone pays 🪙 ${buyIn}; the winner takes the whole pot.`}
          </Text>

          <Pressable
            style={[styles.primary, busy && styles.primaryDisabled]}
            onPress={handleCreate}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={styles.primaryText}>Create tournament</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.or}>— or —</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Join a tournament</Text>
          <Text style={styles.hint}>
            Joining pays the tournament's buy-in (if any).
          </Text>
          <TextInput
            style={styles.codeInput}
            value={joinCode}
            onChangeText={(t) => setJoinCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={5}
            placeholder="CODE"
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            style={[styles.primary, busy && styles.primaryDisabled]}
            onPress={handleJoin}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={styles.primaryText}>Join</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.felt },
  content: { padding: 20, gap: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  back: { color: colors.textMuted, fontWeight: '700', fontSize: 16, width: 50 },
  title: { color: colors.gold, fontWeight: '900', fontSize: 22 },
  wallet: { color: colors.gold, fontWeight: '800', fontSize: 16, width: 70, textAlign: 'right' },
  errorBanner: {
    backgroundColor: 'rgba(231,76,60,0.9)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  errorText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  card: {
    backgroundColor: colors.feltDark,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    marginVertical: 6,
  },
  cardTitle: { color: colors.gold, fontWeight: '800', fontSize: 18 },
  label: { color: colors.text, fontWeight: '800', fontSize: 15 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fmt: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.feltLight,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  fmtActive: { borderColor: colors.gold },
  fmtText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  fmtTextActive: { color: colors.gold },
  choice: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.feltLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  choiceActive: { borderColor: colors.gold },
  choiceText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  choiceTextActive: { color: colors.gold },
  buyIn: {
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.feltLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  buyInText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  primary: {
    backgroundColor: colors.gold,
    paddingVertical: 14,
    borderRadius: 26,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryDisabled: { backgroundColor: 'rgba(244,197,66,0.55)' },
  primaryText: { color: colors.black, fontSize: 17, fontWeight: '900' },
  or: { color: colors.textMuted, textAlign: 'center', fontWeight: '700' },
  codeInput: {
    backgroundColor: colors.feltLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 8,
    textAlign: 'center',
  },
});
