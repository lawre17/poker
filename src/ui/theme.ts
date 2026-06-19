import { Suit } from '../game/types';

export const colors = {
  felt: '#0b6b3a',
  feltDark: '#085029',
  feltLight: '#0e7d44',
  card: '#fdfdfb',
  cardBack: '#1f3a5f',
  cardBackPattern: '#2c4f7c',
  red: '#c0392b',
  black: '#1c1c1c',
  gold: '#f4c542',
  text: '#f5f5f5',
  textMuted: 'rgba(245,245,245,0.7)',
  overlay: 'rgba(0,0,0,0.55)',
  danger: '#e74c3c',
  accent: '#2980b9',
};

export const suitSymbol: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export function suitColor(suit: Suit): string {
  return suit === 'hearts' || suit === 'diamonds' ? colors.red : colors.black;
}
