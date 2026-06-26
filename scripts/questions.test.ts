// Verifies how question cards (8/Q) may be answered and chained:
//  - same-suit card answers,
//  - ANY question (8/Q, any suit) answers,
//  - a wild Ace answers,
//  - an unrelated card does not.
// Run: npx tsx scripts/questions.test.ts
import { createGame } from '../src/game/engine';
import { cardsConnect, isPlayable } from '../src/game/rules';
import { Card, GameState } from '../src/game/types';

function assert(c: boolean, m: string): void {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok:', m);
}

const card = (rank: string, suit: string): Card =>
  ({ id: `${rank}${suit}`, rank, suit } as Card);

// Build a state with an open question on hearts.
const s: GameState = createGame([
  { id: 'p0', name: 'A', isAI: false },
  { id: 'p1', name: 'B', isAI: false },
]);
s.questionSuit = 'hearts';
s.activeSuit = 'hearts';
s.pendingPenalty = 0;
s.skipCount = 0;

// --- single-card answers (isPlayable during an open question) ---
assert(isPlayable(s, card('5', 'hearts')), 'same-suit plain card answers a question');
assert(isPlayable(s, card('Q', 'spades')), 'a different-suit question (Q♠) answers an 8♥ question');
assert(isPlayable(s, card('8', 'clubs')), 'a different-suit question (8♣) answers a question');
assert(isPlayable(s, card('A', 'spades')), 'a wild Ace (any suit) answers a question');
assert(!isPlayable(s, card('5', 'spades')), 'an unrelated off-suit card does NOT answer a question');
assert(!isPlayable(s, card('K', 'clubs')), 'an off-suit King does NOT answer a question');

// --- chaining (cardsConnect: question -> answer) ---
assert(cardsConnect(card('8', 'hearts'), card('Q', 'hearts')), 'chain 8♥ → Q♥ (same suit)');
assert(cardsConnect(card('8', 'hearts'), card('Q', 'spades')), 'chain 8♥ → Q♠ (question → question, any suit)');
assert(cardsConnect(card('Q', 'hearts'), card('A', 'spades')), 'chain Q♥ → A♠ (question → wild Ace)');
assert(cardsConnect(card('8', 'hearts'), card('5', 'hearts')), 'chain 8♥ → 5♥ (question → same-suit answer)');
assert(!cardsConnect(card('8', 'hearts'), card('5', 'spades')), 'no chain 8♥ → 5♠ (off-suit non-question)');
assert(!cardsConnect(card('K', 'hearts'), card('Q', 'spades')), 'non-question prev does not chain by suit');

console.log('\nPASS: question answer/chain rules verified.');
