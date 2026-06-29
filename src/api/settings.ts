import * as SecureStore from 'expo-secure-store';
import { GameSettings } from '../game/types';

// Player-chosen game preferences, persisted across launches. These drive the
// "Play vs AI" game; online rooms intentionally override `assistedMode` (see
// below) because card hints would be unfair against real opponents.
const KEY = 'kadi_settings';

export type AppSettings = GameSettings;

// Assisted mode is OFF by default — you pick cards freely and only illegal
// plays are blocked. It can be turned on for solo practice against the AI.
export const DEFAULT_APP_SETTINGS: AppSettings = {
  stackingPenalties: false,
  assistedMode: false,
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    return { ...DEFAULT_APP_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(settings));
  } catch {
    /* ignore — preferences are a convenience, not critical */
  }
}
