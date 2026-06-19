// Core domain types for the Kadi card game.

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

// Ranks in a standard 52-card deck.
export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K';

export const RANKS: Rank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
];

// Cards that carry a special power and therefore:
//  - cannot be the flipped starting card, and
//  - cannot be the card you finish (win) on.
export const SPECIAL_RANKS: Rank[] = ['A', '2', '3', '8', 'J', 'Q', 'K'];

// Question cards must be answered with a card of the same suit.
export const QUESTION_RANKS: Rank[] = ['8', 'Q'];

export interface Card {
  id: string; // e.g. "hearts-A"
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  hand: Card[];
}

export type Direction = 1 | -1;

export interface GameSettings {
  // When true, countering a penalty (2 on 2 / 3 on 3) adds the values together
  // and passes the growing total on. When false, the penalty just passes on
  // unchanged to the next player.
  stackingPenalties: boolean;
  // When true, the UI highlights playable cards and guides selection. When
  // false (manual mode), the player picks freely and illegal plays are rejected
  // by the rules at play time.
  assistedMode: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  stackingPenalties: false,
  assistedMode: true,
};

export type Phase = 'playing' | 'finished';

export interface GameState {
  players: Player[];
  drawPile: Card[];
  discardPile: Card[]; // last element is the top card
  currentPlayerIndex: number;
  direction: Direction;
  // The suit currently in force. Normally the top card's suit, but an Ace can
  // override it to any chosen suit.
  activeSuit: Suit;
  // When a question card (8/Q) is on top and unanswered, the suit that must be
  // matched to answer it. null when there is no open question.
  questionSuit: Suit | null;
  // Accumulated penalty the current player must satisfy (pick that many cards),
  // unless they counter or block it.
  pendingPenalty: number;
  // Number of pending Jack skips. Each Jack played adds one. The current player
  // may bounce one by playing their own Jack, or accept it (lose their turn,
  // decrementing the count) — repeating until the count reaches zero.
  skipCount: number;
  // Player ids that have announced "Kadi" (allowed to win on their next play).
  announcedKadi: Record<string, boolean>;
  // True when the current player just dropped to their last card and must
  // declare "Kadi" before the turn passes. Their turn is held until they do.
  awaitingAnnounce: boolean;
  phase: Phase;
  winnerId: string | null;
  settings: GameSettings;
  // Human-readable log of what happened, newest last.
  log: string[];
}

export type Move =
  | { type: 'play'; cardId: string; chosenSuit?: Suit } // chosenSuit required for Ace
  | { type: 'playSequence'; cardIds: string[]; chosenSuit?: Suit } // multi-card throw
  | { type: 'draw' } // pick a card / satisfy a penalty
  | { type: 'skipTurn' } // accept a Jack skip (lose your turn)
  | { type: 'announceKadi' };
