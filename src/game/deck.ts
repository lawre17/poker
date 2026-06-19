import { Card, RANKS, SUITS } from './types';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}-${rank}`, suit, rank });
    }
  }
  return deck;
}

// Fisher–Yates shuffle. Returns a new array.
export function shuffle<T>(input: T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// How many cards each player is dealt: 4 for up to 3 players, otherwise 3.
export function cardsPerPlayer(numPlayers: number): number {
  return numPlayers <= 3 ? 4 : 3;
}
