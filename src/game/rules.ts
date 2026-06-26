import {
  Card,
  GameState,
  QUESTION_RANKS,
  Rank,
  SPECIAL_RANKS,
} from './types';

export function isSpecial(rank: Rank): boolean {
  return SPECIAL_RANKS.includes(rank);
}

export function isQuestion(rank: Rank): boolean {
  return QUESTION_RANKS.includes(rank);
}

export function penaltyValue(rank: Rank): number {
  if (rank === '2') return 2;
  if (rank === '3') return 3;
  return 0;
}

export function topCard(state: GameState): Card {
  return state.discardPile[state.discardPile.length - 1];
}

/**
 * Can `card` legally be played by the current player given the full game state?
 *
 * Order of precedence:
 *  1. Pending penalty  -> only a matching counter (same rank 2/3) or an Ace (block).
 *  2. Open question     -> only a card of the question's suit.
 *  3. Normal play       -> match active suit, or match rank, or play an Ace (wild).
 *
 * Playing the last card is always allowed by the normal matching rules. Whether
 * it WINS is decided in the engine: an invalid finish (special card, or no Kadi
 * declared) simply leaves the player "cardless" instead of winning.
 */
export function isPlayable(state: GameState, card: Card): boolean {
  const top = topCard(state);

  // 0. Under a Jack skip — only another Jack bounces it onward.
  if (state.skipCount > 0) {
    return card.rank === 'J';
  }

  // 1. Penalty in force.
  if (state.pendingPenalty > 0) {
    if (card.rank === 'A') return true; // Ace blocks any penalty.
    if (top.rank === '2' && card.rank === '2') return true;
    if (top.rank === '3' && card.rank === '3') return true;
    return false;
  }

  // 2. Open question — answer with a card of the question's suit, OR with
  //    another question (8/Q of any suit), OR with a wild Ace.
  if (state.questionSuit) {
    return (
      card.suit === state.questionSuit ||
      isQuestion(card.rank) ||
      card.rank === 'A'
    );
  }

  // 3. Normal play.
  if (card.rank === 'A') return true; // Ace is wild, playable any time.
  if (card.suit === state.activeSuit) return true;
  if (card.rank === top.rank) return true;
  return false;
}

export function playableCards(state: GameState, hand: Card[]): Card[] {
  return hand.filter((c) => isPlayable(state, c));
}

// ---- Sequence ("throw") play ----

// A clean turn is one with no pending penalty, skip, or open question — only
// then may a player lay down a multi-card sequence.
export function canStartSequence(state: GameState): boolean {
  return (
    state.pendingPenalty === 0 && state.skipCount === 0 && !state.questionSuit
  );
}

// Does `card` match the current top (suit or rank), ignoring win/penalty rules?
export function matchesTop(state: GameState, card: Card): boolean {
  if (card.rank === 'A') return true; // Ace is wild
  if (card.suit === state.activeSuit) return true;
  if (card.rank === topCard(state).rank) return true;
  return false;
}

// Two consecutive cards in a chain connect only if:
//  - they share a rank (e.g. J♣ → J♥, Q♥ → Q♠), or
//  - the previous card is a question (8/Q) and the next is a valid answer: a
//    card of the same suit (8♥ → Q♥, Q♠ → 10♠), another question of any suit
//    (8♥ → Q♠), or a wild Ace.
// Matching by suit alone does NOT chain two ordinary cards (K♥ → J♥ is illegal).
export function cardsConnect(prev: Card, next: Card): boolean {
  if (prev.rank === next.rank) return true;
  if (isQuestion(prev.rank)) {
    return (
      next.suit === prev.suit || isQuestion(next.rank) || next.rank === 'A'
    );
  }
  return false;
}

// Can `candidate` be appended to the sequence built so far this turn?
export function canAddToSequence(
  state: GameState,
  seq: Card[],
  candidate: Card
): boolean {
  if (seq.some((c) => c.id === candidate.id)) return false;
  if (seq.length === 0) return matchesTop(state, candidate);
  return cardsConnect(seq[seq.length - 1], candidate);
}

// Is there a single play (one card or a connected chain) that uses the player's
// ENTIRE hand and ends on a non-special card — i.e. a play they could win on?
// Returns the winning ordering, or null. (Brute-forces small hands.)
export function findWinningPlay(state: GameState, hand: Card[]): Card[] | null {
  const n = hand.length;
  if (n === 0) return null;
  if (n === 1) {
    const c = hand[0];
    return matchesTop(state, c) && !isSpecial(c.rank) ? [c] : null;
  }
  if (n > 6) return null; // too large to brute-force; not a realistic throw

  const used = new Array(n).fill(false);
  const seq: Card[] = [];
  const dfs = (): Card[] | null => {
    if (seq.length === n) {
      return isSpecial(seq[n - 1].rank) ? null : seq.slice();
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const card = hand[i];
      const ok =
        seq.length === 0
          ? matchesTop(state, card)
          : cardsConnect(seq[seq.length - 1], card);
      if (!ok) continue;
      used[i] = true;
      seq.push(card);
      const res = dfs();
      if (res) return res;
      seq.pop();
      used[i] = false;
    }
    return null;
  };
  return dfs();
}

// Does the current player have any legal play at all?
export function hasAnyPlay(state: GameState): boolean {
  const player = state.players[state.currentPlayerIndex];
  return player.hand.some((c) => isPlayable(state, c));
}
