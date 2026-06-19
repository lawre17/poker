import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Card } from '../game/types';
import { CardView } from './CardView';
import { colors } from './theme';

// One card per suit, fanned out behind the title.
const SPLASH_CARDS: Card[] = [
  { id: 'splash-spades', suit: 'spades', rank: 'A' },
  { id: 'splash-hearts', suit: 'hearts', rank: 'K' },
  { id: 'splash-clubs', suit: 'clubs', rank: 'Q' },
  { id: 'splash-diamonds', suit: 'diamonds', rank: 'J' },
];

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const cardAnims = useRef(
    SPLASH_CARDS.map(() => new Animated.Value(0))
  ).current;
  const title = useRef(new Animated.Value(0)).current;
  const sub = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const cards = Animated.stagger(
      120,
      cardAnims.map((a) =>
        Animated.spring(a, {
          toValue: 1,
          friction: 6,
          tension: 55,
          useNativeDriver: true,
        })
      )
    );

    Animated.sequence([
      cards,
      Animated.timing(title, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.back(1.7)),
        useNativeDriver: true,
      }),
      Animated.timing(sub, { toValue: 1, duration: 340, useNativeDriver: true }),
      Animated.delay(750),
      Animated.timing(fade, {
        toValue: 0,
        duration: 460,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }, []);

  const n = SPLASH_CARDS.length;

  return (
    <Animated.View style={[styles.root, { opacity: fade }]}>
      <View style={styles.fan}>
        {SPLASH_CARDS.map((card, i) => {
          const a = cardAnims[i];
          const offset = i - (n - 1) / 2;
          return (
            <Animated.View
              key={card.id}
              style={[
                styles.fanCard,
                {
                  opacity: a,
                  transform: [
                    {
                      translateX: a.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, offset * 54],
                      }),
                    },
                    {
                      translateY: a.interpolate({
                        inputRange: [0, 1],
                        outputRange: [50, Math.abs(offset) * 10],
                      }),
                    },
                    {
                      rotate: a.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', `${offset * 13}deg`],
                      }),
                    },
                    {
                      scale: a.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <CardView card={card} size="lg" />
            </Animated.View>
          );
        })}
      </View>

      <Animated.Text
        style={[
          styles.brand,
          {
            opacity: title,
            transform: [
              {
                scale: title.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.7, 1],
                }),
              },
              {
                translateY: title.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
              },
            ],
          },
        ]}
      >
        KADI
      </Animated.Text>

      <Animated.Text style={[styles.subtitle, { opacity: sub }]}>
        the card game
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.felt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fan: {
    height: 150,
    width: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  fanCard: { position: 'absolute' },
  brand: {
    fontSize: 76,
    fontWeight: '900',
    color: colors.gold,
    letterSpacing: 8,
    textShadowColor: 'rgba(244,197,66,0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 17,
    letterSpacing: 2,
    marginTop: 4,
    textTransform: 'uppercase',
  },
});
