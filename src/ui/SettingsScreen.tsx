import React, { useState } from 'react';
import {
  Modal,
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

type Tab = 'gameplay' | 'preferences';

const RULES = [
  "Match the top card's suit or rank.",
  '2 → next picks 2 · 3 → next picks 3.',
  '8 / Q → question, answer same suit.',
  'J → skip · K → reverse · A → change suit & block penalty.',
  'Announce “Kadi” on your last card.',
  "You can't finish on a special card.",
];

export function SettingsScreen({ onExit }: Props) {
  const { settings, update, prefs, updatePrefs } = useSettings();
  const [tab, setTab] = useState<Tab>('gameplay');
  const [rulesOpen, setRulesOpen] = useState(false);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onExit} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Settings</Text>
          <Pressable
            onPress={() => setRulesOpen(true)}
            hitSlop={10}
            style={styles.helpBtn}
            accessibilityLabel="How to play"
          >
            <Text style={styles.helpIcon}>?</Text>
          </Pressable>
        </View>
        <View style={{ width: 50 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'gameplay' && styles.tabActive]}
          onPress={() => setTab('gameplay')}
        >
          <Text style={[styles.tabText, tab === 'gameplay' && styles.tabTextActive]}>
            Gameplay
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'preferences' && styles.tabActive]}
          onPress={() => setTab('preferences')}
        >
          <Text
            style={[styles.tabText, tab === 'preferences' && styles.tabTextActive]}
          >
            Preferences
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'gameplay' ? (
          <View style={styles.card}>
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
                <Text style={styles.label}>Ace demand</Text>
                <Text style={styles.hint}>
                  Stacking 2+ Aces lets you demand a rank — each player must play
                  it or draw, until it circles back to you. A single Ace still
                  just blocks a penalty and changes suit.
                </Text>
              </View>
              <Switch
                value={settings.aceDemand}
                onValueChange={(v) => update({ aceDemand: v })}
                trackColor={{ true: colors.gold }}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Assisted mode</Text>
                <Text style={styles.hint}>
                  Highlights your playable cards. Off = pick freely; illegal plays
                  are blocked by the rules. Applies to games vs AI only — online
                  matches are always unassisted.
                </Text>
              </View>
              <Switch
                value={settings.assistedMode}
                onValueChange={(v) => update({ assistedMode: v })}
                trackColor={{ true: colors.gold }}
              />
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Vibrate on my turn</Text>
                <Text style={styles.hint}>
                  Buzz this phone when it becomes your turn to play.
                </Text>
              </View>
              <Switch
                value={prefs.vibrateOnMyTurn}
                onValueChange={(v) => updatePrefs({ vibrateOnMyTurn: v })}
                trackColor={{ true: colors.gold }}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* How-to-play rules popup */}
      <Modal
        visible={rulesOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRulesOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setRulesOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.rulesTitle}>How to play</Text>
            {RULES.map((r) => (
              <Text key={r} style={styles.rule}>
                • {r}
              </Text>
            ))}
            <Pressable
              style={styles.modalClose}
              onPress={() => setRulesOpen(false)}
            >
              <Text style={styles.modalCloseText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.felt },
  content: { padding: 20, paddingTop: 8, gap: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    marginBottom: 12,
  },
  back: { color: colors.textMuted, fontWeight: '700', fontSize: 16, width: 50 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.gold, fontWeight: '900', fontSize: 22 },
  helpBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpIcon: { color: colors.gold, fontWeight: '900', fontSize: 14, lineHeight: 18 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: colors.feltDark,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.gold },
  tabText: { color: colors.textMuted, fontWeight: '800', fontSize: 15 },
  tabTextActive: { color: colors.felt },
  card: {
    backgroundColor: colors.feltDark,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    marginVertical: 6,
  },
  label: { color: colors.text, fontWeight: '800', fontSize: 16 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.feltDark,
    borderRadius: 16,
    padding: 22,
    gap: 6,
  },
  rulesTitle: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 18,
    marginBottom: 6,
  },
  rule: { color: colors.text, fontSize: 14, lineHeight: 21 },
  modalClose: {
    marginTop: 14,
    alignSelf: 'flex-end',
    backgroundColor: colors.gold,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalCloseText: { color: colors.felt, fontWeight: '800', fontSize: 15 },
});
