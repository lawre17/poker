import { applyMove, createGame, PlayerConfig } from '../src/game/engine';
import { Card, GameState, Suit } from '../src/game/types';

// Focused test for the "cardless situation" rule. Uses the real applyMove.

const configs: PlayerConfig[] = [
  { id: 'p0', name: 'P0', isAI: false },
  { id: 'p1', name: 'P1', isAI: false },
];

function card(id: string): Card {
  const [suit, rank] = id.split('-');
  return { id, suit: suit as Suit, rank: rank as Card['rank'] };
}

const failures: string[] = [];
function assert(cond: boolean, msg: string): void {
  if (!cond) failures.push(msg);
}

// Build a base game, then overwrite the fields we care about by hand.
function makeState(): GameState {
  const state = createGame(configs);
  // Deterministic hands & top card.
  state.players[0].hand = [card('diamonds-A')]; // p0: lone Ace
  state.players[1].hand = [card('clubs-5'), card('hearts-7')]; // p1: 2 cards
  state.discardPile = [card('clubs-3')]; // top is a 3
  state.activeSuit = 'clubs';
  state.questionSuit = null;
  state.pendingPenalty = 3; // a penalty is pending on p0
  state.skipCount = 0;
  state.announcedKadi = { p0: false, p1: false };
  state.awaitingAnnounce = false;
  state.currentPlayerIndex = 0;
  state.phase = 'playing';
  state.winnerId = null;
  return state;
}

// --- Scenario 1: p0 plays a lone Ace into a cardless state ---
let state = makeState();
let threw = false;
try {
  state = applyMove(state, {
    type: 'play',
    cardId: 'diamonds-A',
    chosenSuit: 'hearts',
  });
} catch (e) {
  threw = true;
}
assert(!threw, 'Playing the lone Ace should be accepted (no throw).');
assert(state.players[0].hand.length === 0, 'p0 hand should be empty (cardless).');
assert(state.phase === 'playing', 'phase should still be playing (not a win).');
assert(state.winnerId === null, 'winnerId should be null.');
assert(state.pendingPenalty === 0, 'Ace should have blocked the penalty.');
assert(state.currentPlayerIndex === 1, 'turn should advance to p1.');

// --- Scenario 2: p1 cannot win while p0 is cardless ---
// p1 has a matching card and has declared Kadi, yet p0 is cardless => no win.
state.players[1].hand = [card('hearts-7')]; // lone non-special, matches activeSuit hearts
state.activeSuit = 'hearts';
state.announcedKadi.p1 = true;
threw = false;
try {
  state = applyMove(state, { type: 'play', cardId: 'hearts-7' });
} catch (e) {
  threw = true;
}
assert(!threw, 'p1 play should be accepted (no throw).');
assert(state.winnerId === null, 'p1 must NOT win while p0 is cardless.');
assert(state.phase === 'playing', 'game must not finish while p0 is cardless.');
assert(state.players[1].hand.length === 0, 'p1 is now cardless too.');

// --- Scenario 3: p0 re-enters by drawing on its next turn ---
// After p1's play the turn should be back at p0.
assert(state.currentPlayerIndex === 0, 'turn should be back at p0.');
state = applyMove(state, { type: 'draw' });
assert(state.players[0].hand.length >= 1, 'p0 re-entered with >= 1 card.');
assert(state.phase === 'playing', 'phase still playing after p0 draws.');

if (failures.length === 0) {
  console.log('PASS: cardless rule behaves correctly.');
} else {
  console.log('FAIL:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
