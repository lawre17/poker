import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings } from './SettingsContext';
import { colors } from './theme';

interface Props {
  onExit: () => void;
}

export function SettingsScreen({ onExit }: Props) {
  const { settings, update } = useSettings();

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={onExit} hitSlop={8}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Settings</Text>
          <View style={{ width: 50 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Game</Text>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Stack penalties</Text>
              <Text style={styles.hint}>
                Countering a 2/3 adds the totals together.
              </Text>
            </View>
            <Switch
              value={settings.stackingPenalties}
              onValueChange={(v) => update({ stackingPenalties: v })}
              trackColor={{ true: colors.gold }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Assisted mode</Text>
              <Text style={styles.hint}>
                Highlights your playable cards. Off = pick freely; illegal plays
                are blocked by the rules. Applies to games vs AI only —
                online matches are always unassisted.
              </Text>
            </View>
            <Switch
              value={settings.assistedMode}
              onValueChange={(v) => update({ assistedMode: v })}
              trackColor={{ true: colors.gold }}
            />
          </View>
        </View>

        <View style={styles.rules}>
          <Text style={styles.rulesTitle}>How to play</Text>
          <Text style={styles.rule}>• Match the top card's suit or rank.</Text>
          <Text style={styles.rule}>• 2 → next picks 2 · 3 → next picks 3.</Text>
          <Text style={styles.rule}>• 8 / Q → question, answer same suit.</Text>
          <Text style={styles.rule}>
            • J → skip · K → reverse · A → change suit & block penalty.
          </Text>
          <Text style={styles.rule}>• Announce “Kadi” on your last card.</Text>
          <Text style={styles.rule}>• You can't finish on a special card.</Text>
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
  card: {
    backgroundColor: colors.feltDark,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    marginVertical: 6,
  },
  cardTitle: { color: colors.gold, fontWeight: '800', fontSize: 18 },
  label: { color: colors.text, fontWeight: '800', fontSize: 16 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  rules: {
    marginTop: 6,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 14,
    padding: 18,
    gap: 6,
  },
  rulesTitle: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 4,
  },
  rule: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
