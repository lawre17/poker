import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors } from './theme';

// Ludo-style floating message: pops in over a player's seat, holds, then fades.
// The parent removes it from state on its own timer (~3.5s); this just animates.
export function ChatBubble({ text }: { text: string }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      friction: 6,
      tension: 90,
      useNativeDriver: true,
    }).start();
    const t = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 3000);
    return () => clearTimeout(t);
  }, [anim]);

  // A short message is almost certainly an emoji — show it big, bubble-free.
  const emojiOnly = text.trim().length <= 3;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        emojiOnly ? styles.emojiWrap : styles.bubble,
        {
          opacity: anim,
          transform: [
            { scale: anim },
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text
        style={emojiOnly ? styles.emoji : styles.text}
        numberOfLines={2}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: 160,
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  text: { color: '#1a1a1a', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  emojiWrap: { paddingHorizontal: 4 },
  emoji: { fontSize: 40, textAlign: 'center' },
});
