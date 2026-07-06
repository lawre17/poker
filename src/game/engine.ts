import { cardsPerPlayer, createDeck, shuffle } from './deck';
import {
  canStartSequence,
  cardsConnect,
  hasAnyPlay,
  isPlayable,
  isSpecial,
  matchesTop,
  penaltyValue,
  topCard,
} from './rules';
import {
  Card,
  DEFAULT_SETTINGS,
  GameSettings,
  GameState,
  Move,
  Player,
  Rank,
  Suit,
} from './types';

export interface PlayerConfig {
  id: string;
  name: string;
  isAI: boolean;
}

const RANK_LABEL: Record<string, string> = {
  A: 'Ace',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
};

export function cardLabel(card: Card): string {
  const r = RANK_LABEL[card.rank] ?? card.rank;
  return `${r} of ${card.suit}`;
}

export function createGame(
  configs: PlayerConfig[],
  settings: GameSettings = DEFAULT_SETTINGS
): GameState {
  if (configs.length < 2) throw new Error('Need at least 2 players');

  let deck = shuffle(createDeck());
  const perPlayer = cardsPerPlayer(configs.length);

  const players: Player[] = configs.map((c) => ({
    id: c.id,
    name: c.name,
    isAI: c.isAI,
    hand: [],
  }));

  for (let i = 0; i < perPlayer; i++) {
    for (const player of players) {
      player.hand.push(deck.pop()!);
    }
  }

  // Flip a starting card that is NOT special. Move any specials to the bottom.
  const bottom: Card[] = [];
  let start: Card | undefined;
  while (deck.length > 0) {
    const c = deck.pop()!;
    if (!isSpecial(c.rank)) {
      start = c;
      break;
    }
    bottom.unshift(c);
  }
  if (!start) throw new Error('No non-special card to start with');
  const drawPile = [...bottom, ...deck];

  const announcedKadi: Record<string, boolean> = {};
  for (const p of players) announcedKadi[p.id] = false;

  const state: GameState = {
    players,
    drawPile,
    discardPile: [start],
    currentPlayerIndex: 0,
    direction: 1,
    activeSuit: start.suit,
    questionSuit: null,
    demandRank: null,
    demanderIndex: null,
    pendingPenalty: 0,
    skipCount: 0,
    announcedKadi,
    awaitingAnnounce: false,
    declaredThisTurn: false,
    phase: 'playing',
    winnerId: null,
    settings,
    log: [`Game started. Top card: ${cardLabel(start)}.`],
  };

  return state;
}

// ---- internal helpers (mutate the passed-in state copy) ----

function clone(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: p.hand.slice() })),
    drawPile: state.drawPile.slice(),
    discardPile: state.discardPile.slice(),
    announcedKadi: { ...state.announcedKadi },
    log: state.log.slice(),
  };
}

function indexAfter(state: GameState, from: number, step: number): number {
  const n = state.players.length;
  return (((from + step * state.direction) % n) + n) % n;
}

// Draw n cards into the given player's hand, reshuffling the discard pile back
// into the draw pile when it runs dry.
function drawCards(state: GameState, player: Player, n: number): void {
  for (let i = 0; i < n; i++) {
    if (state.drawPile.length === 0) {
      const top = state.discardPile.pop()!;
      const recycled = shuffle(state.discardPile);
      state.drawPile = recycled;
      state.discardPile = [top];
    }
    if (state.drawPile.length === 0) break; // truly nothing left
    player.hand.push(state.drawPile.pop()!);
  }
  // Drawing means you couldn't go out — you lose a "Kadi" you declared on an
  // EARLIER turn. A draw on your declaration turn keeps it (you'll try next turn).
  if (!state.declaredThisTurn) state.announcedKadi[player.id] = false;
}

// Only the most recent entries are ever shown, and the whole state is broadcast
// over Reverb (which caps message size), so keep the log bounded — an unbounded
// log eventually pushes the payload past the limit ("Pusher payload too large").
const MAX_LOG = 40;
function log(state: GameState, msg: string): void {
  state.log.push(msg);
  if (state.log.length > MAX_LOG) {
    state.log = state.log.slice(-MAX_LOG);
  }
}

// ---- the reducer ----

export function applyMove(prev: GameState, move: Move): GameState {
  if (prev.phase === 'finished') return prev;
  const state = clone(prev);
  const player = state.players[state.currentPlayerIndex];

  if (move.type === 'skipTurn') {
    if (state.skipCount <= 0) return prev; // nothing to skip
    skipPlayer(state, player);
    advanceTurn(state, 1);
    return state;
  }

  if (move.type === 'announceKadi') {
    // Declaring is ALWAYS available on your turn until you've declared. It does
    // NOT end your turn — you say it and keep playing — but `declaredThisTurn`
    // blocks a win on this same turn, so you can only finish on a later turn.
    if (state.announcedKadi[player.id]) return prev; // already declared
    state.announcedKadi[player.id] = true;
    state.declaredThisTurn = true;
    log(state, `${player.name} declares "Niko Kadi!"`);
    return state;
  }

  if (move.type === 'draw') {
    if (state.skipCount > 0) {
      // Drawing isn't an option while skipped — treat it as accepting the skip.
      skipPlayer(state, player);
      advanceTurn(state, 1);
      return state;
    }
    if (state.pendingPenalty > 0) {
      const n = state.pendingPenalty;
      drawCards(state, player, n);
      log(state, `${player.name} picks ${n} (penalty).`);
      state.pendingPenalty = 0;
    } else if (state.questionSuit) {
      drawCards(state, player, 1);
      log(state, `${player.name} can't answer and picks a card.`);
      state.questionSuit = null; // question dies
    } else if (state.demandRank) {
      // Can't (or won't) meet the demand: pick one up and pass it on. The demand
      // stays open until it circles back to the demander (see advanceTurn).
      drawCards(state, player, 1);
      log(state, `${player.name} has no ${state.demandRank} and picks a card.`);
    } else {
      drawCards(state, player, 1);
      log(state, `${player.name} picks a card.`);
    }
    advanceTurn(state, 1);
    return state;
  }

  if (move.type === 'playSequence') {
    return applySequence(
      state,
      player,
      move.cardIds,
      move.chosenSuit,
      move.demandRank
    );
  }

  // move.type === 'play'
  const card = player.hand.find((c) => c.id === move.cardId);
  if (!card) throw new Error('Card not in hand.');
  if (!isPlayable(state, card)) throw new Error('That card is not playable.');

  // Bouncing a skip: play your own Jack so the skip moves on instead of landing
  // on you. The count is unchanged (your Jack replaces the one aimed at you).
  if (state.skipCount > 0) {
    player.hand = player.hand.filter((c) => c.id !== card.id);
    state.discardPile.push(card);
    state.activeSuit = card.suit;
    state.questionSuit = null;
    log(state, `${player.name} bounces the skip with a Jack.`);
    advanceTurn(state, 1);
    return state;
  }

  // Remove from hand, place on discard.
  player.hand = player.hand.filter((c) => c.id !== card.id);
  state.discardPile.push(card);
  log(state, `${player.name} plays ${cardLabel(card)}.`);

  // Meeting an open Ace demand (only the demanded rank is playable) satisfies it
  // and clears it — the played card's own power still fires below.
  if (state.demandRank !== null) {
    log(state, `${player.name} answers the demand for ${state.demandRank}s.`);
    state.demandRank = null;
    state.demanderIndex = null;
  }

  // Emptying the hand wins only on a valid finish (non-special last card, Kadi
  // declared, and nobody else already cardless). Otherwise the play is allowed
  // but the player goes "cardless" — its power still fires (e.g. a lone Ace
  // still blocks a pending penalty) — and they must pick a card next turn.
  if (player.hand.length === 0) {
    if (isValidWin(state, player, card)) {
      state.phase = 'finished';
      state.winnerId = player.id;
      log(state, `${player.name} wins! 🎉`);
      return state;
    }
    const step = applyOneCardEffect(state, player, card, true, move.chosenSuit);
    log(
      state,
      `${player.name} is now cardless — they must pick a card next turn.`
    );
    finishTurn(state, player, step);
    return state;
  }

  // A non-winning play on a later turn means you didn't go out — you forfeit a
  // "Kadi" declared on an earlier turn. (On your declaration turn it's kept.)
  if (!state.declaredThisTurn && state.announcedKadi[player.id]) {
    state.announcedKadi[player.id] = false;
    log(state, `${player.name} didn't go out — "Kadi" is lost.`);
  }
  const step = applyOneCardEffect(state, player, card, true, move.chosenSuit);
  finishTurn(state, player, step);
  return state;
}

// A play that empties the hand WINS only if all hold: the last card is
// non-special, the player declared "Kadi" on an EARLIER turn (not this one), and
// no OTHER player is currently cardless. While any player is cardless, nobody wins.
function isValidWin(state: GameState, player: Player, last: Card): boolean {
  return (
    !isSpecial(last.rank) &&
    state.announcedKadi[player.id] &&
    !state.declaredThisTurn &&
    noOtherCardless(state, player)
  );
}

// True when no player other than `player` is currently cardless (0 cards).
function noOtherCardless(state: GameState, player: Player): boolean {
  return state.players.every((p) => p.id === player.id || p.hand.length > 0);
}

// Lay down a connected run of cards in one turn. Every card's power fires in
// order (e.g. two Jacks queue two skips). Cannot empty the hand — you go out on
// a single last card on a later turn.
// A 2+ Ace stack under the aceDemand rule sets a rank demand on the table. Call
// AFTER the aces' effects fire but BEFORE the turn advances, so demanderIndex is
// the current (demanding) player. No-op unless the rule is on, every card is an
// Ace, there are at least two, and a rank was chosen.
function maybeSetAceDemand(
  state: GameState,
  player: Player,
  cards: Card[],
  demandRank?: Rank
): void {
  if (
    !state.settings.aceDemand ||
    !demandRank ||
    cards.length < 2 ||
    !cards.every((c) => c.rank === 'A')
  ) {
    return;
  }
  state.demandRank = demandRank;
  state.demanderIndex = state.currentPlayerIndex;
  log(
    state,
    `${player.name} stacks ${cards.length} Aces and demands ${demandRank}s!`
  );
}

function applySequence(
  state: GameState,
  player: Player,
  cardIds: string[],
  chosenSuit?: Suit,
  demandRank?: Rank
): GameState {
  if (!canStartSequence(state)) {
    throw new Error('You can only throw a sequence on a clean turn.');
  }
  if (cardIds.length < 2) throw new Error('A sequence needs at least two cards.');

  const cards: Card[] = [];
  for (const id of cardIds) {
    const c = player.hand.find((x) => x.id === id);
    if (!c) throw new Error('Card not in hand.');
    if (cards.some((x) => x.id === id)) throw new Error('Duplicate card in sequence.');
    cards.push(c);
  }
  if (!matchesTop(state, cards[0])) {
    throw new Error('First card does not match the top.');
  }
  for (let i = 1; i < cards.length; i++) {
    if (!cardsConnect(cards[i - 1], cards[i])) {
      throw new Error('Sequence cards do not connect.');
    }
  }

  const ids = new Set(cardIds);
  player.hand = player.hand.filter((c) => !ids.has(c.id));
  for (const c of cards) state.discardPile.push(c);
  log(state, `${player.name} throws ${cards.map(cardLabel).join(', ')}.`);

  // A throw that empties the hand wins only on a valid finish (non-special last
  // card, Kadi declared, nobody else cardless). Otherwise the throw is allowed
  // but the player goes cardless — every card's power still fires first.
  if (player.hand.length === 0) {
    const last = cards[cards.length - 1];
    if (isValidWin(state, player, last)) {
      state.phase = 'finished';
      state.winnerId = player.id;
      log(state, `${player.name} wins! 🎉`);
      return state;
    }
    let step = 1;
    for (let i = 0; i < cards.length; i++) {
      const isLast = i === cards.length - 1;
      step = applyOneCardEffect(state, player, cards[i], isLast, chosenSuit);
    }
    maybeSetAceDemand(state, player, cards, demandRank);
    log(
      state,
      `${player.name} is now cardless — they must pick a card next turn.`
    );
    finishTurn(state, player, step);
    return state;
  }

  // A non-winning throw on a later turn forfeits a "Kadi" declared earlier.
  if (!state.declaredThisTurn && state.announcedKadi[player.id]) {
    state.announcedKadi[player.id] = false;
    log(state, `${player.name} didn't go out — "Kadi" is lost.`);
  }
  // Every card's power fires, in order; only the last card may leave an open
  // question or set the chosen suit.
  let step = 1;
  for (let i = 0; i < cards.length; i++) {
    const isLast = i === cards.length - 1;
    step = applyOneCardEffect(state, player, cards[i], isLast, chosenSuit);
  }
  maybeSetAceDemand(state, player, cards, demandRank);
  finishTurn(state, player, step);
  return state;
}

// A player accepts (is consumed by) one pending skip. Being skipped does NOT
// void a declared "Kadi" — the player keeps their status across the skip.
function skipPlayer(state: GameState, player: Player): void {
  state.skipCount -= 1;
  log(state, `${player.name} is skipped.`);
}

// Advance the turn. (Declaring "Kadi" is a separate, always-available action,
// so the turn is never held for it.)
function finishTurn(state: GameState, player: Player, step: number): void {
  if (step <= 0) return; // same player keeps the turn (e.g. open question)
  advanceTurn(state, step);
}

// Applies the special power of one card and returns how many places to advance
// the turn (0 = same player continues). `isLast` marks the final card of the
// play: only the last card may open a question or set the Ace's chosen suit —
// a question in the middle of a chain is treated as answered by the next card.
function applyOneCardEffect(
  state: GameState,
  player: Player,
  card: Card,
  isLast: boolean,
  chosenSuit?: Suit
): number {
  state.activeSuit = card.suit;
  state.questionSuit = null;

  switch (card.rank) {
    case 'A': {
      const chosen: Suit = isLast ? chosenSuit ?? card.suit : card.suit;
      state.activeSuit = chosen;
      if (state.pendingPenalty > 0) {
        log(state, `${player.name} blocks the penalty with an Ace.`);
        state.pendingPenalty = 0;
      }
      if (isLast) log(state, `${player.name} changes the suit to ${chosen}.`);
      return 1;
    }
    case '2':
    case '3': {
      const value = penaltyValue(card.rank);
      state.pendingPenalty = state.settings.stackingPenalties
        ? state.pendingPenalty + value
        : value;
      log(state, `Penalty is now ${state.pendingPenalty} for the next player.`);
      return 1;
    }
    case '8':
    case 'Q': {
      // A question in the middle of a chain is answered by the next card; only
      // an unanswered question on the final card stays open.
      if (!isLast) return 1;
      state.questionSuit = card.suit;
      if (!hasAnyPlay(state)) {
        // Can't self-answer: pick one and pass the turn.
        drawCards(state, player, 1);
        log(state, `${player.name} can't answer the question and picks a card.`);
        state.questionSuit = null;
        return 1;
      }
      log(state, `${player.name} asks a question (${card.suit}).`);
      return 0;
    }
    case 'J': {
      // Queue a skip. Each Jack skips one more player downstream.
      state.skipCount += 1;
      log(state, `${player.name} plays a Jack (skips queued: ${state.skipCount}).`);
      return 1;
    }
    case 'K': {
      state.direction = (state.direction * -1) as 1 | -1;
      log(state, `${player.name} reverses the direction.`);
      return 1;
    }
    default:
      return 1;
  }
}

function advanceTurn(state: GameState, step: number): void {
  state.currentPlayerIndex = indexAfter(
    state,
    state.currentPlayerIndex,
    step
  );
  // The declaration window only covers the turn it was made on; once the turn
  // moves on, a declared player may win on their following turn.
  state.declaredThisTurn = false;

  // An open Ace demand dies the moment the turn returns to the player who made
  // it — they don't have to answer their own demand.
  if (state.demandRank !== null && state.currentPlayerIndex === state.demanderIndex) {
    log(state, `The demand for ${state.demandRank}s comes back around and clears.`);
    state.demandRank = null;
    state.demanderIndex = null;
  }
}

// Convenience used by the UI / AI: is there any legal play for the current
// player, or must they draw?
export function currentMustDraw(state: GameState): boolean {
  return !hasAnyPlay(state);
}
