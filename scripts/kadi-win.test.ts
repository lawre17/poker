// Verifies the "Niko Kadi" win rule:
//  - declaring is available any time on your turn and does NOT end the turn,
//  - you CANNOT empty your hand / win on the same turn you declare,
//  - you win on a LATER turn by playing out your cards,
//  - being skipped does NOT lose your declared status.
// Run: npx tsx scripts/kadi-win.test.ts
import { applyMove, createGame } from '../src/game/engine';
import { Card, GameState } from '../src/game/types';

function assert(c: boolean, m: string): void {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok:', m);
}

const card = (id: string, rank: string, suit: string): Card =>
  ({ id, rank, suit } as Card);

function fresh(): { s: GameState; suit: string } {
  const s = createGame([
    { id: 'p0', name: 'A', isAI: false },
    { id: 'p1', name: 'B', isAI: false },
  ]);
  return { s, suit: s.activeSuit };
}

// --- declare is available with >1 card and does NOT end the turn ---
{
  let { s, suit } = fresh();
  s.players[0].hand = [card('c7', '7', suit), card('c5', '5', suit)];
  s.players[1].hand = [card('b9', '9', suit), card('bx', '6', suit)];
  s.currentPlayerIndex = 0;

  s = applyMove(s, { type: 'announceKadi' });
  assert(s.announcedKadi['p0'] === true, 'can declare with 2 cards');
  assert(s.declaredThisTurn === true, 'declaredThisTurn set');
  assert(s.currentPlayerIndex === 0, 'declaring does NOT end your turn');

  // Play one card the same turn — allowed, status kept (declaration turn).
  s = applyMove(s, { type: 'play', cardId: 'c7' });
  assert(s.currentPlayerIndex === 1, 'playing after declaring passes the turn');
  assert(s.announcedKadi['p0'] === true, 'status kept after the declaration-turn play');

  // p1 plays, turn back to p0.
  s = applyMove(s, { type: 'play', cardId: 'b9' });
  assert(s.currentPlayerIndex === 0, 'turn back to p0');
  assert(s.declaredThisTurn === false, 'declaredThisTurn cleared after the turn moved on');

  // p0 plays the last card → win.
  s = applyMove(s, { type: 'play', cardId: 'c5' });
  assert(s.phase === 'finished' && s.winnerId === 'p0', 'p0 wins on a LATER turn');
}

// --- you CANNOT win the same turn you declare ---
{
  let { s, suit } = fresh();
  s.players[0].hand = [card('w', '7', suit)]; // single plain matching card
  s.players[1].hand = [card('b1', '9', suit), card('b2', '6', suit)];
  s.currentPlayerIndex = 0;

  s = applyMove(s, { type: 'announceKadi' });
  // Try to go out immediately — must NOT win (becomes cardless instead).
  s = applyMove(s, { type: 'play', cardId: 'w' });
  assert(s.phase === 'playing', 'emptying your hand the turn you declare is NOT a win');
  assert(s.winnerId === null, 'no winner on a same-turn-as-declare finish');
  assert(s.players[0].hand.length === 0, 'p0 went cardless instead');
}

// --- being skipped keeps your declared status ---
{
  let { s, suit } = fresh();
  s.players[0].hand = [card('x5', '5', suit)];
  s.players[1].hand = [card('j', 'J', suit), card('n9', '9', suit)];
  s.announcedKadi['p0'] = true; // declared on an earlier turn
  s.declaredThisTurn = false;
  s.currentPlayerIndex = 1;

  s = applyMove(s, { type: 'play', cardId: 'j' }); // p1 plays a Jack -> p0 skipped
  assert(s.skipCount === 1 && s.currentPlayerIndex === 0, 'Jack queued a skip onto p0');
  s = applyMove(s, { type: 'skipTurn' }); // p0 accepts the skip
  assert(s.announcedKadi['p0'] === true, 'being skipped does NOT lose Kadi status');
}

console.log('\nPASS: Niko Kadi declare/win/skip rules verified.');
