import { canStartSequence, findWinningPlay, isSpecial, playableCards } from './rules';
import { Card, GameState, Move, Suit, SUITS } from './types';

// Preference order for offloading special cards (Aces kept for last — they're
// the most flexible: wild + penalty block).
const OFFLOAD_ORDER: Record<string, number> = {
  J: 0,
  K: 1,
  '8': 2,
  Q: 3,
  '2': 4,
  '3': 5,
  // plain cards
  '4': 6,
  '5': 6,
  '6': 6,
  '7': 6,
  '9': 6,
  '10': 6,
  A: 9,
};

function mostCommonSuit(hand: Card[], exclude?: Card): Suit {
  const counts: Record<Suit, number> = {
    hearts: 0,
    diamonds: 0,
    clubs: 0,
    spades: 0,
  };
  for (const c of hand) {
    if (exclude && c.id === exclude.id) continue;
    counts[c.suit]++;
  }
  let best: Suit = SUITS[0];
  for (const s of SUITS) if (counts[s] > counts[best]) best = s;
  return best;
}

/**
 * Decide the AI's next move for the current player. The caller applies it and
 * calls again — multi-step turns (announce → play, or question → answer) emerge
 * naturally from repeated calls.
 */
export function decideMove(state: GameState): Move {
  const player = state.players[state.currentPlayerIndex];

  // Under a Jack skip: bounce it with a Jack if possible (but never as the last
  // card), otherwise accept the skip.
  if (state.skipCount > 0) {
    const jack = player.hand.find(
      (c) => c.rank === 'J' && player.hand.length > 1
    );
    return jack ? { type: 'play', cardId: jack.id } : { type: 'skipTurn' };
  }

  const win = canStartSequence(state)
    ? findWinningPlay(state, player.hand)
    : null;
  const declared = state.announcedKadi[player.id];

  // Finish now — but ONLY if we declared on an EARLIER turn (can't win the same
  // turn we declare).
  if (win && declared && !state.declaredThisTurn) {
    if (win.length === 1) return buildPlay(state, player.hand, win[0]);
    const last = win[win.length - 1];
    return {
      type: 'playSequence',
      cardIds: win.map((c) => c.id),
      chosenSuit:
        last.rank === 'A' ? mostCommonSuit(player.hand, last) : undefined,
    };
  }

  const playable = playableCards(state, player.hand);

  // Declare proactively — a turn BEFORE going out — so we can finish next turn.
  // Declaring doesn't end the turn, so we still make a holding move below.
  if (!declared && (win !== null || player.hand.length <= 2) && playable.length > 0) {
    return { type: 'announceKadi' };
  }

  // Holding move on our declaration turn: if we hold a winning chain, peel its
  // first card so the remainder stays a valid finish for next turn.
  if (state.declaredThisTurn && win && win.length >= 2) {
    return buildPlay(state, player.hand, win[0]);
  }

  // Never voluntarily go cardless: down to a single card with no earlier-declared
  // win, drawing is the only non-losing move.
  if (player.hand.length === 1) {
    return { type: 'draw' };
  }

  if (playable.length === 0) {
    return { type: 'draw' };
  }

  // When a penalty is pending, counter with a number penalty before resorting
  // to an Ace (keep the Ace for flexibility).
  if (state.pendingPenalty > 0) {
    const counter = playable.find((c) => c.rank === '2' || c.rank === '3');
    const ace = playable.find((c) => c.rank === 'A');
    const chosen = counter ?? ace!;
    return buildPlay(state, player.hand, chosen);
  }

  // When we've declared and are down to two cards, keep a non-special card as
  // the finisher: play the OTHER card now (often a special one) so next turn we
  // can go out on the plain card.
  if (declared && player.hand.length === 2) {
    const finisher = playable.find((c) => !isSpecial(c.rank));
    if (finisher) {
      const other = player.hand.find((c) => c.id !== finisher.id);
      if (other && playable.some((c) => c.id === other.id)) {
        return buildPlay(state, player.hand, other);
      }
    }
  }

  // Otherwise offload by preference order.
  const sorted = playable
    .slice()
    .sort((a, b) => (OFFLOAD_ORDER[a.rank] ?? 6) - (OFFLOAD_ORDER[b.rank] ?? 6));
  const first = sorted[0];

  // On a clean turn, throw same-rank duplicates together (keeping >=1 card so
  // we don't try to go out on a multi-card throw).
  if (canStartSequence(state)) {
    const dupes = player.hand.filter(
      (c) => c.rank === first.rank && c.id !== first.id
    );
    const take = Math.min(dupes.length, Math.max(0, player.hand.length - 2));
    if (take >= 1) {
      const seq = [first, ...dupes.slice(0, take)];
      return {
        type: 'playSequence',
        cardIds: seq.map((c) => c.id),
        chosenSuit:
          first.rank === 'A' ? mostCommonSuit(player.hand, first) : undefined,
      };
    }
  }

  return buildPlay(state, player.hand, first);
}

function buildPlay(state: GameState, hand: Card[], card: Card): Move {
  if (card.rank === 'A') {
    return { type: 'play', cardId: card.id, chosenSuit: mostCommonSuit(hand, card) };
  }
  return { type: 'play', cardId: card.id };
}
