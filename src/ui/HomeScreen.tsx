import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../api/auth';
import { NewGameOptions } from './useGame';
import { colors } from './theme';

interface Props {
  onStart: (opts: NewGameOptions) => void;
  onPlayOnline: () => void;
}

export function HomeScreen({ onStart, onPlayOnline }: Props) {
  const { user, logout } = useAuth();
  const [opponents, setOpponents] = useState(2);
  const [stacking, setStacking] = useState(false);
  const [assisted, setAssisted] = useState(true);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Account header: wallet + sign out */}
        <View style={styles.header}>
          <View style={styles.wallet}>
            <Text style={styles.walletItem}>🪙 {user?.coins ?? 0}</Text>
            <Text style={styles.walletItem}>🏆 {user?.wins ?? 0}</Text>
          </View>
          <Pressable onPress={logout} hitSlop={8}>
            <Text style={styles.logout}>Logout</Text>
          </Pressable>
        </View>

        <Text style={styles.brand}>KADI</Text>
        <Text style={styles.subtitle}>
          {user ? `Hi ${user.name}` : 'The card game'}
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Opponents</Text>
          <View style={styles.choices}>
            {[1, 2, 3].map((n) => (
              <Pressable
                key={n}
                onPress={() => setOpponents(n)}
                style={[styles.choice, opponents === n && styles.choiceActive]}
              >
                <Text
                  style={[
                    styles.choiceText,
                    opponents === n && styles.choiceTextActive,
                  ]}
                >
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            {opponents + 1 <= 3
              ? `${opponents + 1} players → 4 cards each`
              : `${opponents + 1} players → 3 cards each`}
          </Text>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Stack penalties</Text>
              <Text style={styles.hint}>
                Countering a 2/3 adds the totals together
              </Text>
            </View>
            <Switch
              value={stacking}
              onValueChange={setStacking}
              trackColor={{ true: colors.gold }}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Assisted mode</Text>
              <Text style={styles.hint}>
                Highlights your playable cards. Off = pick freely; illegal plays
                are blocked by the rules.
              </Text>
            </View>
            <Switch
              value={assisted}
              onValueChange={setAssisted}
              trackColor={{ true: colors.gold }}
            />
          </View>
        </View>

        <Pressable
          style={styles.play}
          onPress={() =>
            onStart({
              opponents,
              settings: { stackingPenalties: stacking, assistedMode: assisted },
            })
          }
        >
          <Text style={styles.playText}>Play vs AI ▶</Text>
        </Pressable>

        <Pressable style={styles.playOnline} onPress={onPlayOnline}>
          <Text style={styles.playOnlineText}>Play Online 🌐</Text>
        </Pressable>

        <View style={styles.rules}>
          <Text style={styles.rulesTitle}>How to play</Text>
          <Text style={styles.rule}>• Match the top card's suit or rank.</Text>
          <Text style={styles.rule}>• 2 → next picks 2 · 3 → next picks 3.</Text>
          <Text style={styles.rule}>• 8 / Q → question, answer same suit.</Text>
          <Text style={styles.rule}>• J → skip · K → reverse · A → change suit & block penalty.</Text>
          <Text style={styles.rule}>• Announce “Kadi” on your last card.</Text>
          <Text style={styles.rule}>• You can't finish on a special card.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.felt },
  content: { padding: 24, alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  wallet: { flexDirection: 'row', gap: 16 },
  walletItem: { color: colors.gold, fontWeight: '800', fontSize: 16 },
  logout: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  playOnline: {
    backgroundColor: colors.feltDark,
    borderWidth: 2,
    borderColor: colors.gold,
    paddingVertical: 14,
    paddingHorizontal: 50,
    borderRadius: 30,
    marginTop: 14,
  },
  playOnlineText: { color: colors.gold, fontSize: 18, fontWeight: '900' },
  brand: {
    fontSize: 64,
    fontWeight: '900',
    color: colors.gold,
    letterSpacing: 6,
    marginTop: 20,
  },
  subtitle: { color: colors.textMuted, marginBottom: 28, fontSize: 16 },
  card: {
    backgroundColor: colors.feltDark,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    gap: 12,
  },
  label: { color: colors.text, fontWeight: '800', fontSize: 16 },
  choices: { flexDirection: 'row', gap: 12 },
  choice: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.feltLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  choiceActive: { borderColor: colors.gold },
  choiceText: { color: colors.text, fontSize: 22, fontWeight: '800' },
  choiceTextActive: { color: colors.gold },
  hint: { color: colors.textMuted, fontSize: 13 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 12,
  },
  play: {
    backgroundColor: colors.gold,
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 30,
    marginTop: 28,
  },
  playText: { color: colors.black, fontSize: 20, fontWeight: '900' },
  rules: {
    marginTop: 30,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 14,
    padding: 18,
    gap: 6,
  },
  rulesTitle: { color: colors.gold, fontWeight: '800', fontSize: 16, marginBottom: 4 },
  rule: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
