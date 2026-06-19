import { decideMove } from '../src/game/ai';
import { applyMove, createGame, PlayerConfig } from '../src/game/engine';
import { isSpecial } from '../src/game/rules';
import { GameState } from '../src/game/types';

function playOut(numPlayers: number): { state: GameState; turns: number } {
  const configs: PlayerConfig[] = Array.from({ length: numPlayers }, (_, i) => ({
    id: `p${i}`,
    name: `AI ${i}`,
    isAI: true,
  }));
  let state = createGame(configs);
  let turns = 0;
  const MAX = 100000;
  while (state.phase === 'playing' && turns < MAX) {
    const move = decideMove(state);
    state = applyMove(state, move);
    turns++;
  }
  return { state, turns };
}

let games = 0;
let wins = 0;
let stalls = 0;
const winnerLastCardsAlwaysPlain = { ok: true };

for (const numPlayers of [2, 3, 4, 5]) {
  for (let i = 0; i < 2000; i++) {
    const { state, turns } = playOut(numPlayers);
    games++;
    if (state.phase === 'finished') {
      wins++;
      const winner = state.players.find((p) => p.id === state.winnerId)!;
      // Winner must have an empty hand.
      if (winner.hand.length !== 0) throw new Error('Winner has cards!');
      // The last card on the discard pile must be non-special.
      const last = state.discardPile[state.discardPile.length - 1];
      if (isSpecial(last.rank)) {
        winnerLastCardsAlwaysPlain.ok = false;
        console.log('Winner finished on special card:', last);
      }
      // The winner must have had a standing Kadi declaration.
      if (!state.announcedKadi[winner.id]) {
        throw new Error('Winner had not declared Kadi!');
      }
      // No skip should be left dangling and nobody owes a declaration.
      if (state.skipCount !== 0 || state.awaitingAnnounce) {
        throw new Error('Game ended in an inconsistent skip/announce state.');
      }
    } else {
      stalls++;
      if (stalls <= 3) console.log(`Stall at ${numPlayers}p after ${turns} turns`);
    }
  }
}

console.log(JSON.stringify({ games, wins, stalls, winnerLastCardsAlwaysPlain }, null, 2));
