import * as SecureStore from 'expo-secure-store';

// Remembers the tournament the player is currently in, so an accidental close /
// back-out can be resumed from the home screen ("Rejoin tournament").
const KEY = 'kadi_active_tournament';

export interface ActiveTournament {
  tournamentId: string;
  code: string;
}

export async function getActiveTournament(): Promise<ActiveTournament | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as ActiveTournament) : null;
  } catch {
    return null;
  }
}

export async function setActiveTournament(t: ActiveTournament): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(t));
  } catch {
    /* ignore — resume is a convenience, not critical */
  }
}

export async function clearActiveTournament(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* ignore */
  }
}
