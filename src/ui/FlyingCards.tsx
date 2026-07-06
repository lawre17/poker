import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { CardView } from './CardView';

// A face-down card in flight from the draw pile to a player's stack. Coords are
// centres, expressed relative to the overlay container (so they're immune to any
// safe-area padding). The card offsets itself by half its size so its centre —
// not its corner — lands on the target.
export interface Flight {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  index: number; // position within its batch, drives the stagger
}

// md card (must match CardView's `md` size).
const FLY_W = 66;
const FLY_H = 94;
const STAGGER_MS = 120;
const DURATION_MS = 560;

function FlyingCard({
  flight,
  onDone,
}: {
  flight: Flight;
  onDone: (id: string) => void;
}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: DURATION_MS,
      delay: flight.index * STAGGER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) onDone(flight.id);
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateX = t.interpolate({
    inputRange: [0, 1],
    outputRange: [flight.fromX - FLY_W / 2, flight.toX - FLY_W / 2],
  });
  const translateY = t.interpolate({
    inputRange: [0, 1],
    outputRange: [flight.fromY - FLY_H / 2, flight.toY - FLY_H / 2],
  });
  // Shrink a touch as it lands, and fade out over the last leg so it hands off
  // cleanly to the real card that has already appeared in the stack.
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] });
  const rotate = t.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', flight.index % 2 === 0 ? '12deg' : '-12deg'],
  });
  const opacity = t.interpolate({
    inputRange: [0, 0.85, 1],
    outputRange: [1, 1, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.flyer,
        { opacity, transform: [{ translateX }, { translateY }, { rotate }, { scale }] },
      ]}
    >
      <CardView faceDown size="md" />
    </Animated.View>
  );
}

// Full-bleed overlay that renders the in-flight cards. Always mounted (even with
// no flights) so its window offset can be measured for coordinate mapping.
export const FlyingCardsOverlay = forwardRef<
  View,
  { flights: Flight[]; onDone: (id: string) => void }
>(function FlyingCardsOverlay({ flights, onDone }, ref) {
  return (
    <View ref={ref} style={StyleSheet.absoluteFill} pointerEvents="none">
      {flights.map((f) => (
        <FlyingCard key={f.id} flight={f} onDone={onDone} />
      ))}
    </View>
  );
});

// Owns the list of in-flight cards. `launch` spawns `count` staggered cards from
// one centre to another; each removes itself when it lands.
export function useCardFlights() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const seq = useRef(0);

  const launch = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }, count: number) => {
      setFlights((prev) => {
        const batch: Flight[] = [];
        for (let i = 0; i < count; i++) {
          seq.current += 1;
          batch.push({
            id: `fly-${seq.current}`,
            fromX: from.x,
            fromY: from.y,
            toX: to.x,
            toY: to.y,
            index: i,
          });
        }
        return [...prev, ...batch];
      });
    },
    []
  );

  const remove = useCallback((id: string) => {
    setFlights((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return { flights, launch, remove };
}

const styles = StyleSheet.create({
  flyer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
