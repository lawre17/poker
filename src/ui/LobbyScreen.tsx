import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../api/auth';
import { ApiError } from '../api/client';
import {
  createMatch,
  joinMatch,
  Roster,
  startMatch,
} from '../api/matches';
import { ReverbClient } from '../realtime/reverb';
import { colors } from './theme';

// Where friends grab the app. Served by kadi-api's /download route.
const DOWNLOAD_URL = 'https://kadi.olininnovations.co.ke/download';

// Fun invite text for a room code, with the download link so newcomers can grab
// the app in the same message.
function inviteMessage(code: string): string {
  return (
    `🃏 Join my Kadi game!\n\n` +
    `Room code: *${code}*\n\n` +
    `Get the app 👉 ${DOWNLOAD_URL}`
  );
}

export interface OnlineMatch {
  matchId: string;
  roster: Roster;
}

interface Props {
  onExit: () => void;
  // Fired when the host starts (or, for guests, when the match begins) — hands
  // the live match off to the online GameScreen.
  onEnterGame: (match: OnlineMatch) => void;
}

type Mode = 'menu' | 'hosting' | 'joined';

export function LobbyScreen({ onExit, onEnterGame }: Props) {
  const { user, token } = useAuth();

  const [mode, setMode] = useState<Mode>('menu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Host config (reuse HomeScreen control style). Assisted mode is intentionally
  // omitted online — card hints would be unfair against real opponents.
  const [aiOpponents, setAiOpponents] = useState(0);
  const [stacking, setStacking] = useState(false);
  const [aceDemand, setAceDemand] = useState(false);

  // Join input.
  const [joinCode, setJoinCode] = useState('');

  // Active room.
  const [code, setCode] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [roster, setRoster] = useState<Roster>([]);
  const [isHost, setIsHost] = useState(false);

  const clientRef = useRef<ReverbClient | null>(null);
  const enteredRef = useRef(false);
  const rosterRef = useRef<Roster>([]);
  rosterRef.current = roster;
  const enterGameRef = useRef(onEnterGame);
  enterGameRef.current = onEnterGame;

  // Subscribe to roomState for the active match so the roster stays live and a
  // started match (gameState arriving) pulls everyone into the game.
  useEffect(() => {
    if (matchId == null || !token) return;
    const client = new ReverbClient(matchId, token, {
      onRoomState: (p) => setRoster(p.roster),
      onGameState: () => {
        // Match has started (server broadcast initial state). Guests enter.
        if (!enteredRef.current && !isHost) {
          enteredRef.current = true;
          enterGameRef.current({ matchId, roster: rosterRef.current });
        }
      },
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [matchId, token, isHost]);

  // Share the room code on WhatsApp with the download link baked in. Falls back
  // to the wa.me web link, then the OS share sheet, if WhatsApp isn't installed.
  const shareToWhatsApp = async () => {
    if (!code) return;
    const msg = inviteMessage(code);
    const waApp = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    const waWeb = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    try {
      if (await Linking.canOpenURL(waApp)) {
        await Linking.openURL(waApp);
      } else {
        await Linking.openURL(waWeb);
      }
    } catch {
      try {
        await Share.share({ message: msg });
      } catch {
        /* user dismissed / nothing to do */
      }
    }
  };

  const handleCreate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createMatch({
        aiOpponents,
        settings: {
          stackingPenalties: stacking,
          assistedMode: false,
          aceDemand,
        },
      });
      setCode(res.code);
      setMatchId(res.matchId);
      setRoster(res.roster);
      setIsHost(true);
      setMode('hosting');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create a room.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (busy) return;
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) {
      setError('Enter the room code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await joinMatch(c);
      setCode(c);
      setMatchId(res.matchId);
      setRoster(res.roster);
      setIsHost(false);
      setMode('joined');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not join that room.');
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    if (busy || matchId == null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await startMatch(matchId);
      enteredRef.current = true;
      onEnterGame({ matchId, roster: res.roster });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start the match.');
      setBusy(false);
    }
  };

  // --- Render helpers -------------------------------------------------------

  const RosterList = (
    <View style={styles.rosterBox}>
      <Text style={styles.rosterTitle}>Players ({roster.length})</Text>
      {roster.length === 0 ? (
        <Text style={styles.hint}>Waiting for players…</Text>
      ) : (
        roster
          .slice()
          .sort((a, b) => a.seatIndex - b.seatIndex)
          .map((r) => (
            <View key={r.engineId} style={styles.rosterRow}>
              <Text style={styles.rosterName}>
                {r.name}
                {user && String(r.userId) === String(user.id) ? ' (you)' : ''}
              </Text>
              <Text style={styles.rosterTag}>
                {r.isAI ? '🤖 AI' : '🧑 Player'}
              </Text>
            </View>
          ))
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={onExit} hitSlop={8}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Play Online</Text>
          <View style={{ width: 50 }} />
        </View>

        {!!error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {mode === 'menu' && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Create a room</Text>

              <Text style={styles.label}>AI opponents</Text>
              <View style={styles.choices}>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setAiOpponents(n)}
                    style={[
                      styles.choice,
                      aiOpponents === n && styles.choiceActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        aiOpponents === n && styles.choiceTextActive,
                      ]}
                    >
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hint}>
                Friends join with the room code. AI fills extra seats.
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
                  <Text style={styles.label}>Ace demand</Text>
                  <Text style={styles.hint}>
                    Stack 2+ Aces to demand a rank — play it or draw
                  </Text>
                </View>
                <Switch
                  value={aceDemand}
                  onValueChange={setAceDemand}
                  trackColor={{ true: colors.gold }}
                />
              </View>

              <Pressable
                style={[styles.primary, busy && styles.primaryDisabled]}
                onPress={handleCreate}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.black} />
                ) : (
                  <Text style={styles.primaryText}>Create room</Text>
                )}
              </Pressable>
            </View>

            <Text style={styles.or}>— or —</Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Join a room</Text>
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
          </>
        )}

        {(mode === 'hosting' || mode === 'joined') && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Room</Text>
            {!!code && (
              <>
                <View style={styles.codeBadge}>
                  <Text style={styles.codeLabel}>Code</Text>
                  <Text style={styles.codeValue}>{code}</Text>
                </View>
                <Pressable style={styles.whatsappBtn} onPress={shareToWhatsApp}>
                  <Text style={styles.whatsappBtnText}>
                    Share code on WhatsApp
                  </Text>
                </Pressable>
              </>
            )}

            {RosterList}

            {isHost ? (
              <Pressable
                style={[styles.primary, busy && styles.primaryDisabled]}
                onPress={handleStart}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.black} />
                ) : (
                  <Text style={styles.primaryText}>Start match ▶</Text>
                )}
              </Pressable>
            ) : (
              <Text style={styles.waiting}>
                Waiting for the host to start…
              </Text>
            )}
          </View>
        )}
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
  choice: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.feltLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  choiceActive: { borderColor: colors.gold },
  choiceText: { color: colors.text, fontSize: 20, fontWeight: '800' },
  choiceTextActive: { color: colors.gold },
  hint: { color: colors.textMuted, fontSize: 13 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 12,
  },
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
  codeBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    paddingVertical: 12,
  },
  codeLabel: { color: colors.textMuted, fontSize: 13 },
  codeValue: {
    color: colors.gold,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 8,
  },
  whatsappBtn: {
    backgroundColor: '#25D366',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  whatsappBtnText: { color: '#0b3d20', fontWeight: '800', fontSize: 15 },
  rosterBox: { gap: 8 },
  rosterTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  rosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  rosterName: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rosterTag: { color: colors.textMuted, fontSize: 13 },
  waiting: {
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 6,
  },
});
