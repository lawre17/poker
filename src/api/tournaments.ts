import { GameSettings } from '../game/types';
import { apiFetch } from './client';
import { Roster } from './matches';

export type TournamentFormat = 'bracket' | 'league' | 'survival';
export type TournamentStatus = 'registering' | 'running' | 'finished';
export type TournamentPlayerStatus =
  | 'registered'
  | 'active'
  | 'eliminated'
  | 'champion';

export interface TournamentPlayerSummary {
  userId: number;
  name: string;
  status: TournamentPlayerStatus;
  points: number;
  place: number | null;
  eliminatedRound: number | null;
}

export interface TournamentSummary {
  id: string;
  code: string;
  format: TournamentFormat;
  status: TournamentStatus;
  hostUserId: number;
  buyIn: number;
  prizePool: number;
  tableSize: number;
  currentRound: number;
  roundsTotal: number | null;
  winnerUserId: number | null;
  players: TournamentPlayerSummary[];
}

// One seated table within a round (from the matchReady broadcast).
export interface TournamentTablePayload {
  matchId: string;
  userIds: number[];
  roster: Roster;
}

export interface CreateTournamentOptions {
  format?: TournamentFormat;
  tableSize?: number;
  settings?: GameSettings;
}

export function createTournament(
  opts: CreateTournamentOptions = {}
): Promise<TournamentSummary> {
  const body: Record<string, unknown> = {};
  if (opts.format) body.format = opts.format;
  if (opts.tableSize !== undefined) body.tableSize = opts.tableSize;
  if (opts.settings) body.settings = opts.settings;
  return apiFetch<TournamentSummary>('/tournaments', { method: 'POST', body });
}

export function joinTournament(code: string): Promise<TournamentSummary> {
  return apiFetch<TournamentSummary>(
    `/tournaments/${encodeURIComponent(code)}/join`,
    { method: 'POST' }
  );
}

export function startTournament(id: string): Promise<TournamentSummary> {
  return apiFetch<TournamentSummary>(`/tournaments/${id}/start`, {
    method: 'POST',
  });
}

export function leaveTournament(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/tournaments/${id}/leave`, {
    method: 'POST',
  });
}

export interface TournamentShowResponse {
  tournament: TournamentSummary;
  // The live table the caller is seated at in the current round, if any.
  myMatchId: string | null;
}

export function getTournament(id: string): Promise<TournamentShowResponse> {
  return apiFetch<TournamentShowResponse>(`/tournaments/${id}`);
}
