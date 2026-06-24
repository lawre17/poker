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
}

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
  const aiOpponents = Math.max(0, Math.min(3, opts.aiOpponents ?? 0));
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
  if (humans.length + ais.length >= 4) {
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

  // Synchronously drive AI seats while the game is live and the current seat is
  // an AI. No timers — Laravel paces the broadcast of these states.
  while (room.phase === 'playing' && room.state) {
    const cur = currentTurnPlayer(room);
    if (!cur || !cur.isAI) break;
    let aiNext: GameState;
    try {
      const aiMove = decideMove(room.state);
      aiNext = applyMove(room.state, aiMove);
    } catch (err) {
      // An AI failure shouldn't stall the match; stop the loop and return what
      // we have. (decideMove is expected to always produce a legal move.)
      console.warn('[ai] move failed:', (err as Error).message);
      break;
    }
    if (aiNext === room.state && aiNext.phase !== 'finished') {
      // No-op from the AI: bail to avoid an infinite loop.
      break;
    }
    room.state = aiNext;
    states.push(aiNext);
    maybeFinish(room);
  }

  const finished = room.state?.phase === 'finished';
  return {
    states,
    finished,
    winnerUserId: finished ? winnerUserIdFor(room) : null,
  };
}

function maybeFinish(room: Room): void {
  if (room.state && room.state.phase === 'finished') {
    room.phase = 'finished';
  }
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
  return { state: room.state, roster: roster(room) };
}

// Exposed for tests / introspection.
export function roomCount(): number {
  return rooms.size;
}

export function resetRooms(): void {
  rooms.clear();
  matchIndex.clear();
}
