import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

interface Props {
  recording: boolean;
  sending: boolean;
  /** Name of a remote player currently speaking, if any. */
  speakingName: string | null;
  onStart: () => void;
  onStop: () => void;
}

/**
 * Hold-to-talk mic button, pinned to the bottom-left corner so it stays clear
 * of the cards. Press-in starts recording, press-out stops + uploads. Shows a
 * "🔊 {name}" pill when another player's clip is playing.
 */
export function VoiceButton({
  recording,
  sending,
  speakingName,
  onStart,
  onStop,
}: Props) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {speakingName ? (
        <View style={styles.speaking}>
          <Text style={styles.speakingText} numberOfLines={1}>
            🔊 {speakingName}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPressIn={onStart}
        onPressOut={onStop}
        disabled={sending}
        hitSlop={10}
        style={[
          styles.button,
          recording && styles.buttonRec,
          sending && styles.buttonDisabled,
        ]}
      >
        <Text style={styles.icon}>
          {recording ? '● REC' : sending ? '…' : '🎤'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    bottom: 28,
    alignItems: 'flex-start',
    gap: 8,
  },
  speaking: {
    backgroundColor: colors.overlay,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: 180,
  },
  speakingText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  button: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.feltDark,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRec: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  buttonDisabled: { opacity: 0.6 },
  icon: { color: colors.text, fontWeight: '800', fontSize: 16 },
});
