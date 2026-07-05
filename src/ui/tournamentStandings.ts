import {
  TournamentPlayerSummary,
  TournamentSummary,
} from '../api/tournaments';

// Sort key for the standings list. Once finished, order by final place; while
// running: champion, then players still in, then eliminated by how far they got.
export function rankStanding(p: TournamentPlayerSummary): number {
  if (p.place) return 1_000_000 - p.place;
  if (p.status === 'champion') return 1_000_000;
  if (p.status === 'active' || p.status === 'registered') return 500_000;
  return p.eliminatedRound ?? 0;
}

// Players sorted best → worst for display.
export function sortStandings(
  players: TournamentPlayerSummary[]
): TournamentPlayerSummary[] {
  return players.slice().sort((a, b) => rankStanding(b) - rankStanding(a));
}

// The short tag shown next to a player (points for a league, place/status
// otherwise).
export function standingLabel(
  p: TournamentPlayerSummary,
  t: TournamentSummary
): string {
  if (p.status === 'champion') return '🏆 Champion';
  if (t.status === 'finished' && p.place) return `#${p.place}`;
  if (p.status === 'eliminated') {
    return p.eliminatedRound ? `Out · R${p.eliminatedRound}` : 'Out';
  }
  if (p.status === 'active') {
    if (t.format === 'league') return `${p.points} pts`;
    return t.status === 'running' ? `In · R${t.currentRound}` : 'In';
  }
  return 'Ready';
}
