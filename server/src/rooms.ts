// Room and match management — the authoritative in-memory world. A Map of rooms
// keyed by 5-char code holds the seat <-> engineId <-> userId mapping, settings,
// and the live GameState. This module never implements game rules: every state
// transition goes through the imported engine (`createGame`, `applyMove`) and AI
// decisions through `decideMove`.
//
// This is a PURE, in-memory, transport-agnostic API. It makes NO outbound calls
// and holds NO sockets/timers. The Node service is a private localhost engine
// called only by Laravel over HTTP; Laravel handles all client broadcasting,
// pacing, and coin awards. The AI-follow-up loop here is fully synchronous.

import { v4 as uuid } from 'uuid';
import { decideMove } from '../../src/game/ai';
import { applyMove, createGame, type PlayerConfig } from '../../src/game/engine';
import {
  DEFAULT_SETTINGS,
  type GameSettings,
  type GameState,
  type Move,
} from '../../src/game/types';

// ---- types ----

export interface RoomPlayer {
  userId: string;
  name: string;
  seatIndex: number;
  engineId: string; // engine player id: 'p{seat}' for humans, 'ai{seat}' for AI
  isAI: boolean;
}

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface Room {
  roomCode: string;
  matchId: string; // generated at room creation
  state: GameState | null; // null while in lobby
  players: RoomPlayer[];
  settings: GameSettings;
  hostUserId: string;
  phase: RoomPhase;
  lastActivityAt: number; // epoch ms; bumped on every room-touching op (for pruning)
  turnStartedAt: number; // epoch ms the current player's turn began (for timeouts)
  leftUserIds: Set<string>; // humans who left/forfeited — their turns are auto-skipped
  rematchReady: Set<string>; // userIds who accepted a rematch after the game ended
  rematchMatchId: string | null; // the created rematch room, once everyone accepted
}

// How long a present player may stall before any waiting player can skip them.
const TURN_TIMEOUT_MS = 40_000;

// An entry in the roster returned to Laravel.
export interface RosterEntry {
  userId: string;
  name: string;
  seatIndex: number;
  engineId: string;
  isAI: boolean;
}

// Result of applying a human move (plus any synchronous AI follow-ups).
export interface MoveResult {
  states: GameState[];
  finished: boolean;
  winnerUserId: string | null;
  // When finished: every seat's userId ordered best -> worst (winner first, then
  // fewest cards remaining). Empty while the game is still in progress. Used by
  // league/survival tournaments which need a full finishing order, not just a
  // single winner.
  ranking: string[];
}

// A tagged error so the HTTP layer can map to a status code.
export class EngineApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'EngineApiError';
  }
}

// ---- store ----

const rooms = new Map<string, Room>(); // keyed by roomCode
const matchIndex = new Map<string, Room>(); // matchId -> room

// Max seats at one table (humans + AI combined). The 52-card deck deals 3 cards
// each above 3 players, so 6 seats = 18 dealt, leaving a healthy draw pile.
export const MAX_SEATS = 6;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

function genRoomCode(): string {
  let code: string;
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  } while (rooms.has(code));
  return code;
}

const AI_NAMES = ['Bot Ada', 'Bot Kojo', 'Bot Zola', 'Bot Imani'];
function aiName(i: number): string {
  return AI_NAMES[i % AI_NAMES.length];
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function getRoomByMatch(matchId: string): Room | undefined {
  return matchIndex.get(matchId);
}

export function roster(room: Room): RosterEntry[] {
  return room.players
    .slice()
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((p) => ({
      userId: p.userId,
      name: p.name,
      seatIndex: p.seatIndex,
      engineId: p.engineId,
      isAI: p.isAI,
    }));
}

// ---- room lifecycle ----

export interface CreateRoomResult {
  code: string;
  matchId: string;
  roster: RosterEntry[];
}

export function createRoom(opts: {
  hostUserId: string;
  hostName: string;
  settings?: GameSettings;
  aiOpponents?: number;
}): CreateRoomResult {
  const aiOpponents = Math.max(0, Math.min(MAX_SEATS - 1, opts.aiOpponents ?? 0));
  const roomCode = genRoomCode();
  const matchId = uuid();
  const room: Room = {
    roomCode,
    matchId,
    state: null,
    players: [],
    settings: opts.settings ?? DEFAULT_SETTINGS,
    hostUserId: opts.hostUserId,
    phase: 'lobby',
    lastActivityAt: Date.now(),
    turnStartedAt: Date.now(),
    leftUserIds: new Set<string>(),
    rematchReady: new Set<string>(),
    rematchMatchId: null,
  };

  // Host takes seat 0.
  room.players.push({
    userId: opts.hostUserId,
    name: opts.hostName,
    seatIndex: 0,
    engineId: 'p0',
    isAI: false,
  });

  // Reserve AI seats so the lobby reflects the eventual table. Final engine ids
  // are reassigned by seat order at start (see startGame).
  for (let i = 0; i < aiOpponents; i++) {
    const seatIndex = room.players.length;
    room.players.push({
      userId: `ai-${roomCode}-${i}`,
      name: aiName(i),
      seatIndex,
      engineId: `ai${seatIndex}`,
      isAI: true,
    });
  }

  rooms.set(roomCode, room);
  matchIndex.set(matchId, room);
  return { code: roomCode, matchId, roster: roster(room) };
}

export interface JoinRoomResult {
  matchId: string;
  roster: RosterEntry[];
}

export function joinRoom(
  code: string,
  user: { userId: string; name: string }
): JoinRoomResult {
  const room = getRoom(code);
  if (!room) throw new EngineApiError('Room not found.', 404);
  room.lastActivityAt = Date.now();
  if (room.phase !== 'lobby') {
    throw new EngineApiError('Game already started.', 409);
  }
  if (room.players.some((p) => p.userId === user.userId)) {
    throw new EngineApiError('User already joined.', 409);
  }
  // Insert the human at the next HUMAN seat: keep humans contiguous from seat 0
  // and push AI seats after them so engine ids stay tidy.
  const humans = room.players.filter((p) => !p.isAI);
  const ais = room.players.filter((p) => p.isAI);
  if (humans.length + ais.length >= MAX_SEATS) {
    throw new EngineApiError('Room is full.', 409);
  }
  humans.push({
    userId: user.userId,
    name: user.name,
    seatIndex: 0, // reassigned below
    engineId: 'p0',
    isAI: false,
  });
  // Re-seat: humans first (p{i}), then AI seats (ai{i}).
  const ordered = [...humans, ...ais];
  ordered.forEach((p, i) => {
    p.seatIndex = i;
    p.engineId = p.isAI ? `ai${i}` : `p${i}`;
  });
  room.players = ordered;

  return { matchId: room.matchId, roster: roster(room) };
}

// ---- tournament tables ----

export interface SeededMatchResult {
  matchId: string;
  code: string;
  states: GameState[];
  roster: RosterEntry[];
}

// Create and immediately start a fixed-roster, human-only match — a tournament
// table. There is no AI and no join step: Laravel seats everyone up front. The
// first player is the (nominal) host. Reuses the normal room lifecycle so the
// match behaves exactly like any other online game from here on.
export function createSeededMatch(
  players: { userId: string; name: string }[],
  settings?: GameSettings
): SeededMatchResult {
  if (players.length < 2) {
    throw new EngineApiError('A table needs at least 2 players.', 400);
  }
  if (players.length > MAX_SEATS) {
    throw new EngineApiError(`A table holds at most ${MAX_SEATS} players.`, 400);
  }
  const [host, ...rest] = players;
  const created = createRoom({
    hostUserId: host.userId,
    hostName: host.name,
    settings,
    aiOpponents: 0,
  });
  for (const p of rest) {
    joinRoom(created.code, { userId: p.userId, name: p.name });
  }
  const start = startGame(created.matchId, host.userId);
  return {
    matchId: created.matchId,
    code: created.code,
    states: start.states,
    roster: start.roster,
  };
}

// ---- starting a game ----

export interface StartGameResult {
  matchId: string;
  states: GameState[];
  roster: RosterEntry[];
}

export function startGame(
  codeOrMatchId: string,
  userId: string
): StartGameResult {
  // Laravel keys start/move/state by matchId, but rooms are also reachable by
  // their short join code — accept either.
  const room = getRoom(codeOrMatchId) ?? getRoomByMatch(codeOrMatchId);
  if (!room) throw new EngineApiError('Room not found.', 404);
  room.lastActivityAt = Date.now();
  if (room.hostUserId !== userId) {
    throw new EngineApiError('Only the host can start the game.', 403);
  }
  if (room.phase !== 'lobby') {
    throw new EngineApiError('Game already started.', 409);
  }
  if (room.players.length < 2) {
    throw new EngineApiError('Need at least 2 players to start.', 409);
  }

  // Build engine configs from seat order. Assign final engine ids and keep the
  // engineId <-> userId mapping on each RoomPlayer for winner resolution.
  const ordered = room.players.slice().sort((a, b) => a.seatIndex - b.seatIndex);
  const configs: PlayerConfig[] = ordered.map((p, i) => {
    p.seatIndex = i;
    p.engineId = p.isAI ? `ai${i}` : `p${i}`;
    return { id: p.engineId, name: p.name, isAI: p.isAI };
  });
  room.players = ordered;

  room.state = createGame(configs, room.settings);
  room.phase = 'playing';
  room.turnStartedAt = Date.now();

  return { matchId: room.matchId, states: [room.state], roster: roster(room) };
}

// ---- moves ----

function playerByEngineId(room: Room, engineId: string): RoomPlayer | undefined {
  return room.players.find((p) => p.engineId === engineId);
}

function currentTurnPlayer(room: Room): RoomPlayer | undefined {
  if (!room.state) return undefined;
  const engineId = room.state.players[room.state.currentPlayerIndex].id;
  return playerByEngineId(room, engineId);
}

// Resolve a winning engine id to a human userId, or null (e.g. an AI won, or no
// winner). Only humans are returned — Laravel awards coins to humans only.
function winnerUserIdFor(room: Room): string | null {
  if (!room.state || room.state.winnerId == null) return null;
  const winner = playerByEngineId(room, room.state.winnerId);
  if (!winner || winner.isAI) return null;
  return winner.userId;
}

// Full finishing order (best -> worst) as userIds: the winner first, then the
// rest by fewest cards left, ties broken by seat. Includes every seat (AI seats
// too, by their string userId) — tournament tables are all-human so this is the
// player order league/survival score against.
function finishOrderFor(room: Room): string[] {
  if (!room.state || room.state.phase !== 'finished') return [];
  const winnerId = room.state.winnerId;
  return room.state.players
    .map((p) => {
      const rp = playerByEngineId(room, p.id);
      return {
        userId: String(rp?.userId ?? p.id),
        isWinner: p.id === winnerId,
        cards: p.hand.length,
        seat: rp?.seatIndex ?? 0,
      };
    })
    .sort((a, b) => {
      if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
      if (a.cards !== b.cards) return a.cards - b.cards;
      return a.seat - b.seat;
    })
    .map((r) => r.userId);
}

/**
 * Apply a human move, then synchronously run every following AI move until it's
 * a human's turn or the game ends. Returns the full list of resulting states
 * (the human's plus each AI step), whether the game finished, and the resolved
 * human winner (null if an AI won or unfinished).
 *
 * Throws EngineApiError:
 *  - 404 if the match is unknown
 *  - 409 if the game isn't in progress or it isn't this user's turn
 *  - 422 if the move is illegal (engine throws, OR returns the same state object
 *        unchanged on a non-finished state — a no-op illegal move)
 */
export function applyHumanMove(
  matchId: string,
  userId: string,
  move: Move
): MoveResult {
  const room = getRoomByMatch(matchId);
  if (!room) throw new EngineApiError('Match not found.', 404);
  room.lastActivityAt = Date.now();
  if (!room.state || room.phase !== 'playing') {
    throw new EngineApiError('Game is not in progress.', 409);
  }

  const turnPlayer = currentTurnPlayer(room);
  if (!turnPlayer || turnPlayer.isAI || turnPlayer.userId !== userId) {
    throw new EngineApiError('Not your turn.', 409);
  }

  const states: GameState[] = [];

  // Apply the human move.
  let next: GameState;
  try {
    next = applyMove(room.state, move);
  } catch (e) {
    throw new EngineApiError((e as Error)?.message ?? 'Illegal move.', 422);
  }
  // The engine sometimes returns the SAME state object for no-op illegal moves
  // (e.g. playing while awaiting an announce). Treat next===prev on an
  // unfinished state as a rejection.
  if (next === room.state && next.phase !== 'finished') {
    throw new EngineApiError('Move not allowed right now.', 422);
  }
  room.state = next;
  states.push(next);
  maybeFinish(room);

  // Drive AI seats, then auto-skip any player who has left the table.
  driveAI(room, states);
  settleAbsent(room, states);

  room.turnStartedAt = Date.now();
  const finished = room.state?.phase === 'finished';
  return {
    states,
    finished,
    winnerUserId: finished ? winnerUserIdFor(room) : null,
    ranking: finished ? finishOrderFor(room) : [],
  };
}

function maybeFinish(room: Room): void {
  if (room.state && room.state.phase === 'finished') {
    room.phase = 'finished';
  }
}

// Synchronously drive AI seats while the game is live and the current seat is an
// AI. No timers — Laravel paces the broadcast of these states.
function driveAI(room: Room, states: GameState[]): void {
  while (room.phase === 'playing' && room.state) {
    const cur = currentTurnPlayer(room);
    if (!cur || !cur.isAI) break;
    let aiNext: GameState;
    try {
      aiNext = applyMove(room.state, decideMove(room.state));
    } catch (err) {
      console.warn('[ai] move failed:', (err as Error).message);
      break;
    }
    if (aiNext === room.state && aiNext.phase !== 'finished') break; // no-op guard
    room.state = aiNext;
    states.push(aiNext);
    maybeFinish(room);
  }
}

// Apply one automatic move for whoever is on turn (declare if the engine is
// forcing it, otherwise draw) — both always pass the turn on. Used to skip a
// player who is idle (timeout) or has left. Returns the produced state, if any.
function autoStep(room: Room): GameState | null {
  if (!room.state || room.phase !== 'playing') return null;
  const move: Move = room.state.awaitingAnnounce
    ? { type: 'announceKadi' }
    : { type: 'draw' };
  let next: GameState;
  try {
    next = applyMove(room.state, move);
  } catch {
    return null;
  }
  if (next === room.state && next.phase !== 'finished') return null;
  room.state = next;
  maybeFinish(room);
  return next;
}

// While the game is live and it's an absent (left) player's turn, auto-skip
// them; if only one human is left present, end the game in their favour. Drives
// AI in between. Guarded against runaway loops.
function settleAbsent(room: Room, states: GameState[]): void {
  let guard = 0;
  while (room.phase === 'playing' && room.state && guard++ < 64) {
    const present = room.players.filter(
      (p) => !p.isAI && !room.leftUserIds.has(p.userId)
    );
    if (present.length <= 1) {
      finishByForfeit(room, present[0]);
      if (room.state) states.push(room.state);
      return;
    }
    driveAI(room, states);
    const cur = currentTurnPlayer(room);
    if (!cur || cur.isAI) break;
    if (!room.leftUserIds.has(cur.userId)) break; // a present human is on turn
    const produced = autoStep(room);
    if (!produced) break;
    states.push(produced);
  }
}

// Force-finish a game because everyone else left. The lone remaining human (if
// any) is the winner; with nobody left it just ends.
function finishByForfeit(room: Room, winner: RoomPlayer | undefined): void {
  if (!room.state) return;
  room.state = {
    ...room.state,
    phase: 'finished',
    winnerId: winner ? winner.engineId : null,
    log: [
      ...room.state.log,
      winner
        ? `${winner.name} wins — everyone else left.`
        : 'Game ended — all players left.',
    ],
  };
  room.phase = 'finished';
}

// ---- leaving & timeouts ----

// A player intentionally leaves (forfeits). In a 2-player game the other player
// wins immediately; with 3+ the seat is marked absent and its turns are skipped.
export function leaveRoom(matchId: string, userId: string): MoveResult {
  const room = getRoomByMatch(matchId);
  if (!room) throw new EngineApiError('Match not found.', 404);
  room.lastActivityAt = Date.now();

  const player = room.players.find((p) => p.userId === userId && !p.isAI);
  if (!player) throw new EngineApiError('You are not in this match.', 403);

  room.leftUserIds.add(userId);
  const states: GameState[] = [];

  if (room.state && room.phase === 'playing') {
    settleAbsent(room, states);
    room.turnStartedAt = Date.now();
  }

  const finished = room.state?.phase === 'finished';
  return {
    states,
    finished,
    winnerUserId: finished ? winnerUserIdFor(room) : null,
    ranking: finished ? finishOrderFor(room) : [],
  };
}

export interface TimeoutResult extends MoveResult {
  skipped: boolean;
}

// A waiting player asks to skip the current player who has stalled. Only honored
// once the turn has been idle past TURN_TIMEOUT_MS (the server is the clock, so
// clients can't skip each other early). Auto-plays one move for the stalled seat.
export function timeoutMove(matchId: string, requesterId: string): TimeoutResult {
  const none: TimeoutResult = {
    skipped: false,
    states: [],
    finished: false,
    winnerUserId: null,
    ranking: [],
  };
  const room = getRoomByMatch(matchId);
  if (!room) throw new EngineApiError('Match not found.', 404);
  if (!room.state || room.phase !== 'playing') return none;
  if (!room.players.some((p) => p.userId === requesterId)) {
    throw new EngineApiError('You are not in this match.', 403);
  }

  const cur = currentTurnPlayer(room);
  if (!cur || cur.isAI) return none; // AI turns resolve synchronously already
  if (Date.now() - room.turnStartedAt < TURN_TIMEOUT_MS) return none;

  const states: GameState[] = [];
  const produced = autoStep(room);
  if (!produced) return none;
  states.push(produced);
  driveAI(room, states);
  settleAbsent(room, states);
  room.lastActivityAt = Date.now();
  room.turnStartedAt = Date.now();

  const finished = room.state?.phase === 'finished';
  return {
    skipped: true,
    states,
    finished,
    winnerUserId: finished ? winnerUserIdFor(room) : null,
    ranking: finished ? finishOrderFor(room) : [],
  };
}

// ---- rematch ----

export interface RematchResult {
  started: boolean;
  ready: string[]; // userIds who've accepted so far
  total: number; // how many humans need to accept
  newMatchId: string | null;
  code: string | null;
  hostUserId: string | null;
  roster: RosterEntry[];
  states: GameState[];
  cannot: boolean; // a rematch isn't possible (e.g. <2 players remain)
}

// A participant of a FINISHED match opts into a rematch. Once every remaining
// (non-left) human has opted in, a fresh room with the same players + AI count
// is created and started, and its id is returned so clients can jump straight in.
export function requestRematch(oldMatchId: string, userId: string): RematchResult {
  const room = getRoomByMatch(oldMatchId);
  if (!room) throw new EngineApiError('Match not found.', 404);
  if (room.phase !== 'finished') {
    throw new EngineApiError('The game is not finished yet.', 409);
  }
  if (!room.players.some((p) => p.userId === userId && !p.isAI)) {
    throw new EngineApiError('You are not in this match.', 403);
  }
  room.lastActivityAt = Date.now();

  const needed = room.players
    .filter((p) => !p.isAI && !room.leftUserIds.has(p.userId))
    .sort((a, b) => a.seatIndex - b.seatIndex);
  const aiCount = room.players.filter((p) => p.isAI).length;

  const result = (extra: Partial<RematchResult> = {}): RematchResult => ({
    started: false,
    ready: [...room.rematchReady],
    total: needed.length,
    newMatchId: null,
    code: null,
    hostUserId: null,
    roster: [],
    states: [],
    cannot: false,
    ...extra,
  });

  // Already created (someone completed it first) — return it idempotently.
  if (room.rematchMatchId) {
    const nr = getRoomByMatch(room.rematchMatchId);
    return result({
      started: true,
      newMatchId: room.rematchMatchId,
      code: nr?.roomCode ?? null,
      hostUserId: nr?.hostUserId ?? null,
      roster: nr ? roster(nr) : [],
      states: nr?.state ? [nr.state] : [],
    });
  }

  // Not enough players for a fresh game (e.g. the opponent left).
  if (needed.length + aiCount < 2) {
    return result({ cannot: true });
  }

  room.rematchReady.add(userId);

  if (!needed.every((p) => room.rematchReady.has(p.userId))) {
    return result(); // still waiting on others
  }

  // Everyone's in — build the rematch with the same players and AI count.
  const host = needed[0];
  const created = createRoom({
    hostUserId: host.userId,
    hostName: host.name,
    settings: room.settings,
    aiOpponents: aiCount,
  });
  for (const h of needed.slice(1)) {
    joinRoom(created.code, { userId: h.userId, name: h.name });
  }
  const start = startGame(created.matchId, host.userId);
  room.rematchMatchId = created.matchId;

  return result({
    started: true,
    newMatchId: created.matchId,
    code: created.code,
    hostUserId: host.userId,
    roster: start.roster,
    states: start.states,
  });
}

// ---- state ----

export interface StateResult {
  state: GameState;
  roster: RosterEntry[];
}

export function getState(matchId: string): StateResult {
  const room = getRoomByMatch(matchId);
  if (!room || !room.state) {
    throw new EngineApiError('Match not found.', 404);
  }
  room.lastActivityAt = Date.now();
  return { state: room.state, roster: roster(room) };
}

// Remove rooms idle for longer than idleMs from BOTH indexes and return the
// count pruned. Bounded-memory guard: finished/abandoned games are never
// removed by gameplay, so without this the maps grow forever. The 30-min
// default keeps active and recently-finished games (so clients can still fetch
// the final state) while reclaiming old/abandoned ones.
export function pruneRooms(idleMs = 30 * 60 * 1000): number {
  const now = Date.now();
  let pruned = 0;
  for (const [code, room] of rooms) {
    if (now - room.lastActivityAt > idleMs) {
      rooms.delete(code);
      matchIndex.delete(room.matchId);
      pruned++;
    }
  }
  return pruned;
}

// Exposed for tests / introspection.
export function roomCount(): number {
  return rooms.size;
}

export function resetRooms(): void {
  rooms.clear();
  matchIndex.clear();
}
