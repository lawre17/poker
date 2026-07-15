// Verifies the "Still Kadi" rule:
//  - a plain pick on a LATER turn drops a previously-declared Kadi (unchanged),
//  - a "Still Kadi" pick (draw with keepKadi) keeps the declared status so the
//    player can go out on a later turn when the suit finally favours them,
//  - the choice applies to penalty picks too,
//  - a plain pick on the DECLARATION turn still keeps the status (unchanged).
// Run: npx tsx scripts/still-kadi.test.ts
import { applyMove, createGame } from '../src/game/engine';
import { Card, GameState, Suit } from '../src/game/types';

function assert(c: boolean, m: string): void {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok:', m);
}

const card = (id: string, rank: string, suit: string): Card =>
  ({ id, rank, suit } as Card);

function fresh(): { s: GameState; suit: Suit; other: Suit } {
  const s = createGame([
    { id: 'p0', name: 'A', isAI: false },
    { id: 'p1', name: 'B', isAI: false },
  ]);
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const suit = s.activeSuit;
  const other = suits.find((x) => x !== suit)!;
  return { s, suit, other };
}

// A player declared on an EARLIER turn, holding a finisher whose suit doesn't
// match the table — they can't go out this turn and must pick.
function declaredButStuck(): GameState {
  const { s, suit, other } = fresh();
  s.players[0].hand = [card('fin', '4', other)]; // plain card, wrong suit
  s.players[1].hand = [card('b9', '9', suit)];
  s.announcedKadi['p0'] = true;
  s.declaredThisTurn = false;
  s.currentPlayerIndex = 0;
  return s;
}

// --- a plain pick on a later turn DROPS the declared Kadi (unchanged) ---
{
  const s = declaredButStuck();
  const next = applyMove(s, { type: 'draw' });
  assert(next.announcedKadi['p0'] === false, 'a plain pick drops a declared Kadi');
  assert(next.players[0].hand.length === 2, 'the plain pick added a card');
  assert(next.currentPlayerIndex === 1, 'the pick passed the turn');
}

// --- a "Still Kadi" pick KEEPS the declared status ---
{
  const s = declaredButStuck();
  const next = applyMove(s, { type: 'draw', keepKadi: true });
  assert(next.announcedKadi['p0'] === true, 'Still Kadi keeps the declared status');
  assert(next.players[0].hand.length === 2, 'Still Kadi still adds a card');
  assert(next.currentPlayerIndex === 1, 'Still Kadi passes the turn');
}

// --- Still Kadi keeps status through a PENALTY pick; a plain penalty pick drops it ---
{
  const s = declaredButStuck();
  s.pendingPenalty = 2;

  const kept = applyMove(s, { type: 'draw', keepKadi: true });
  assert(kept.announcedKadi['p0'] === true, 'Still Kadi keeps status on a penalty pick');
  assert(kept.pendingPenalty === 0, 'the penalty was satisfied');
  assert(kept.players[0].hand.length === 3, 'penalty pick drew 2 cards');

  const dropped = applyMove(s, { type: 'draw' });
  assert(dropped.announcedKadi['p0'] === false, 'a plain penalty pick drops Kadi');
}

// --- a plain pick on the DECLARATION turn keeps the status (unchanged) ---
{
  const { s, other } = fresh();
  s.players[0].hand = [card('a', '4', other)];
  s.players[1].hand = [card('b9', '9', s.activeSuit)];
  s.currentPlayerIndex = 0;

  let st = applyMove(s, { type: 'announceKadi' }); // declaredThisTurn = true
  st = applyMove(st, { type: 'draw' }); // plain pick, same turn
  assert(st.announcedKadi['p0'] === true, 'a plain pick on the declaration turn keeps Kadi');
}

console.log('\nPASS: Still Kadi pick rules verified.');
