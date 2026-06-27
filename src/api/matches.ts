import { GameSettings, GameState, Move } from '../game/types';
import { apiFetch } from './client';

export interface RosterEntry {
  // Human seats carry the numeric user id; AI seats carry a string token like
  // "ai-ABCDE-1". Compare against user ids via String() to be safe.
  userId: string | number | null;
  name: string;
  seatIndex: number;
  engineId: string; // e.g. "p0", "p1", "ai2"
  isAI: boolean;
}

export type Roster = RosterEntry[];

export interface CreateMatchResponse {
  code: string;
  matchId: string;
  roster: Roster;
}

export interface JoinMatchResponse {
  matchId: string;
  roster: Roster;
}

export interface StartMatchResponse {
  matchId: string;
  roster: Roster;
}

export interface MoveResponse {
  ok: boolean;
  finished: boolean;
  winnerUserId: number | null;
}

export interface CreateMatchOptions {
  settings?: GameSettings;
  aiOpponents?: number;
}

export function createMatch(
  opts: CreateMatchOptions = {}
): Promise<CreateMatchResponse> {
  const body: Record<string, unknown> = {};
  if (opts.settings) body.settings = opts.settings;
  if (opts.aiOpponents !== undefined) body.aiOpponents = opts.aiOpponents;
  return apiFetch<CreateMatchResponse>('/matches', {
    method: 'POST',
    body,
  });
}

export function joinMatch(code: string): Promise<JoinMatchResponse> {
  return apiFetch<JoinMatchResponse>(
    `/matches/${encodeURIComponent(code)}/join`,
    { method: 'POST' }
  );
}

export function startMatch(matchId: string): Promise<StartMatchResponse> {
  return apiFetch<StartMatchResponse>(`/matches/${matchId}/start`, {
    method: 'POST',
  });
}

export function sendMove(matchId: string, move: Move): Promise<MoveResponse> {
  return apiFetch<MoveResponse>(`/matches/${matchId}/move`, {
    method: 'POST',
    body: { move },
  });
}

export interface MatchStateResponse {
  state: GameState | null;
  roster: Roster;
}

// Current authoritative state — fetched when opening the game so we render
// immediately instead of waiting for the next broadcast.
export function getMatchState(matchId: string): Promise<MatchStateResponse> {
  return apiFetch<MatchStateResponse>(`/matches/${matchId}/state`);
}

// Send a short text chat message to the room. Ephemeral — the server only
// broadcasts it over Reverb (nothing is stored).
export function sendChat(matchId: string, text: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/matches/${matchId}/chat`, {
    method: 'POST',
    body: { text },
  });
}

// Leave/forfeit a match. The engine ends a 2-player game in the other player's
// favour, or skips the seat in a larger game.
export function leaveMatch(matchId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/matches/${matchId}/leave`, {
    method: 'POST',
  });
}

export interface RematchResponse {
  ok: boolean;
  started: boolean;
  newMatchId: string | null;
  roster: Roster;
  cannot: boolean;
}

// Opt into a rematch of a finished game. When everyone accepts, the server
// returns/broadcasts the new match to drop into.
export function requestRematch(matchId: string): Promise<RematchResponse> {
  return apiFetch<RematchResponse>(`/matches/${matchId}/rematch`, {
    method: 'POST',
  });
}

// Ask the server to skip the current player if they've stalled past the turn
// timeout. A premature request is a harmless no-op (the server is the clock).
export function pingTimeout(
  matchId: string
): Promise<{ ok: boolean; skipped: boolean }> {
  return apiFetch<{ ok: boolean; skipped: boolean }>(
    `/matches/${matchId}/timeout`,
    { method: 'POST' }
  );
}
