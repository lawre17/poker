import * as SecureStore from 'expo-secure-store';
import type { Roster } from './matches';

// Remembers the match the player is currently in, so an accidental app close /
// back-out can be resumed from the home screen ("Rejoin game").
const KEY = 'kadi_active_match';

export interface ActiveMatch {
  matchId: string;
  roster: Roster;
}

export async function getActiveMatch(): Promise<ActiveMatch | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as ActiveMatch) : null;
  } catch {
    return null;
  }
}

export async function setActiveMatch(match: ActiveMatch): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(match));
  } catch {
    /* ignore — resume is a convenience, not critical */
  }
}

export async function clearActiveMatch(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* ignore */
  }
}
