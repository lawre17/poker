import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Roster } from '../api/matches';
import { ChatPanel } from './ChatPanel';
import { GameScreen } from './GameScreen';
import { useOnlineGame } from './useOnlineGame';
import { colors } from './theme';

interface Props {
  matchId: string;
  roster: Roster;
  onExit: () => void;
}

export function OnlineGameScreen({ matchId, roster, onExit }: Props) {
  const {
    state,
    feedback,
    status,
    selfId,
    playCard,
    playSequence,
    draw,
    skipTurn,
    announceKadi,
    exit,
    leave,
    messages,
    unreadChat,
    sendChatMessage,
    markChatRead,
    floats,
  } = useOnlineGame({ matchId, roster, onExit });

  // Leaving an in-progress game forfeits it, so confirm first.
  const confirmLeave = () => {
    if (!state || state.phase === 'finished') {
      leave();
      return;
    }
    Alert.alert(
      'Leave game?',
      "You'll forfeit this match — in a 2-player game your opponent wins.",
      [
        { text: 'Keep playing', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: leave },
      ]
    );
  };

  // Until the first gameState arrives, show a connecting placeholder.
  if (!state) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} size="large" />
          <Text style={styles.status}>
            {status === 'subscribed' || status === 'connected'
              ? 'Waiting for the game to start…'
              : 'Connecting…'}
          </Text>
          <Pressable onPress={exit} hitSlop={8}>
            <Text style={styles.exit}>✕ Leave</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.fill}>
      <GameScreen
        state={state}
        feedback={feedback}
        selfId={selfId}
        onPlay={playCard}
        onPlaySequence={playSequence}
        onDraw={draw}
        onSkipTurn={skipTurn}
        onAnnounceKadi={announceKadi}
        onExit={confirmLeave}
        floats={floats}
      />
      <ChatPanel
        messages={messages}
        unread={unreadChat}
        onSend={sendChatMessage}
        onOpened={markChatRead}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.felt },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  status: { color: colors.text, fontSize: 16, fontWeight: '700' },
  exit: { color: colors.textMuted, fontWeight: '700', marginTop: 8 },
});
