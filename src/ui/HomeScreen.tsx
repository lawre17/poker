import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActiveMatch } from '../api/activeMatch';
import { ActiveTournament } from '../api/activeTournament';
import { useAuth } from '../api/auth';
import { useSettings } from './SettingsContext';
import { NewGameOptions } from './useGame';
import { colors } from './theme';

interface Props {
  onStart: (opts: NewGameOptions) => void;
  onPlayOnline: () => void;
  onPlayTournament: () => void;
  onOpenSettings: () => void;
  resumeMatch?: ActiveMatch | null;
  onResume?: () => void;
  onForgetResume?: () => void;
  resumeTournament?: ActiveTournament | null;
  onResumeTournament?: () => void;
  onForgetTournament?: () => void;
}

export function HomeScreen({
  onStart,
  onPlayOnline,
  onPlayTournament,
  onOpenSettings,
  resumeMatch,
  onResume,
  onForgetResume,
  resumeTournament,
  onResumeTournament,
  onForgetTournament,
}: Props) {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const [opponents, setOpponents] = useState(2);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Account header: wallet + settings + sign out */}
        <View style={styles.header}>
          <View style={styles.wallet}>
            <Text style={styles.walletItem}>🪙 {user?.coins ?? 0}</Text>
            <Text style={styles.walletItem}>🏆 {user?.wins ?? 0}</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={onOpenSettings}
              hitSlop={10}
              accessibilityLabel="Settings"
            >
              <Text style={styles.gear}>⚙️</Text>
            </Pressable>
            <Pressable onPress={logout} hitSlop={8}>
              <Text style={styles.logout}>Logout</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.brand}>KADI</Text>
        <Text style={styles.subtitle}>
          {user ? `Hi ${user.name}` : 'The card game'}
        </Text>

        {resumeMatch && (
          <View style={styles.resumeCard}>
            <Text style={styles.resumeText}>You have a game in progress</Text>
            <View style={styles.resumeRow}>
              <Pressable style={styles.resumeBtn} onPress={onResume}>
                <Text style={styles.resumeBtnText}>Rejoin ▶</Text>
              </Pressable>
              <Pressable onPress={onForgetResume} hitSlop={8}>
                <Text style={styles.resumeDismiss}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        )}

        {resumeTournament && (
          <View style={styles.resumeCard}>
            <Text style={styles.resumeText}>
              You're in a tournament 🏆 {resumeTournament.code}
            </Text>
            <View style={styles.resumeRow}>
              <Pressable style={styles.resumeBtn} onPress={onResumeTournament}>
                <Text style={styles.resumeBtnText}>Rejoin ▶</Text>
              </Pressable>
              <Pressable onPress={onForgetTournament} hitSlop={8}>
                <Text style={styles.resumeDismiss}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>Opponents</Text>
          <View style={styles.choices}>
            {[1, 2, 3, 4, 5].map((n) => (
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
        </View>

        <Pressable
          style={styles.play}
          onPress={() => onStart({ opponents, settings })}
        >
          <Text style={styles.playText}>Play vs AI ▶</Text>
        </Pressable>

        <Pressable style={styles.playOnline} onPress={onPlayOnline}>
          <Text style={styles.playOnlineText}>Play Online 🌐</Text>
        </Pressable>

        <Pressable style={styles.playOnline} onPress={onPlayTournament}>
          <Text style={styles.playOnlineText}>Tournaments 🏆</Text>
        </Pressable>

        <Pressable style={styles.howTo} onPress={onOpenSettings} hitSlop={6}>
          <Text style={styles.howToText}>How to play & settings ⚙️</Text>
        </Pressable>
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  gear: { fontSize: 22 },
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
  resumeCard: {
    width: '100%',
    backgroundColor: colors.feltDark,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.gold,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  resumeText: { color: colors.text, fontWeight: '800', fontSize: 15 },
  resumeRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  resumeBtn: {
    backgroundColor: colors.gold,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  resumeBtnText: { color: colors.feltDark, fontWeight: '900', fontSize: 15 },
  resumeDismiss: { color: colors.textMuted, fontWeight: '700' },
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
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
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
  play: {
    backgroundColor: colors.gold,
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 30,
    marginTop: 28,
  },
  playText: { color: colors.black, fontSize: 20, fontWeight: '900' },
  howTo: { marginTop: 26, padding: 8 },
  howToText: { color: colors.textMuted, fontWeight: '700', fontSize: 14 },
});
