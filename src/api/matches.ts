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
