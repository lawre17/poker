// Verifies the "Niko Kadi" win rule: a player holding a winning play must first
// DECLARE (which passes the turn, warning opponents), and can only finish on a
// LATER turn — never the same turn they declare. Run: npx tsx scripts/kadi-win.test.ts
import { applyMove, createGame } from '../src/game/engine';
import { Card, GameState } from '../src/game/types';

function assert(c: boolean, m: string): void {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok:', m);
}

let s: GameState = createGame([
  { id: 'p0', name: 'A', isAI: false },
  { id: 'p1', name: 'B', isAI: false },
]);
const suit = s.activeSuit;

// p1 plays a plain matching card to pass the turn to p0 (and keeps spares so it
// is not itself forced to declare). p0 holds a single plain winning card.
s.players[1].hand = [
  { id: 'pass', rank: '9', suit } as Card,
  { id: 'b2', rank: '5', suit } as Card,
  { id: 'b3', rank: '4', suit } as Card,
];
s.players[0].hand = [{ id: 'win', rank: '7', suit } as Card];
s.currentPlayerIndex = 1;

s = applyMove(s, { type: 'play', cardId: 'pass' });
assert(s.currentPlayerIndex === 0, 'turn passed to p0');
assert(s.awaitingAnnounce === true, 'p0 is forced to declare (winning play in hand)');

const blocked = applyMove(s, { type: 'play', cardId: 'win' });
assert(blocked === s, 'playing the winning card is rejected before declaring');

s = applyMove(s, { type: 'announceKadi' });
assert(s.announcedKadi['p0'] === true, 'p0 announced');
assert(s.phase === 'playing', 'declaring does not win immediately');
assert(s.currentPlayerIndex === 1, 'declaring passed the turn to p1 (opponents may react)');

s = applyMove(s, { type: 'play', cardId: 'b2' });
assert(s.currentPlayerIndex === 0, 'turn back to p0');
assert(s.awaitingAnnounce === false, 'p0 already declared — no re-declare');

s = applyMove(s, { type: 'play', cardId: 'win' });
assert(s.phase === 'finished', 'p0 wins on the next turn');
assert(s.winnerId === 'p0', 'winner is p0');

console.log('\nPASS: declare-then-win-next-turn rule verified.');
