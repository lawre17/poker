import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const sources = {
  play: require('../../assets/sounds/play.wav'),
  draw: require('../../assets/sounds/draw.wav'),
  skip: require('../../assets/sounds/skip.wav'),
  penalty: require('../../assets/sounds/penalty.wav'),
  kadi: require('../../assets/sounds/kadi.wav'),
  win: require('../../assets/sounds/win.wav'),
  lose: require('../../assets/sounds/lose.wav'),
};

export type SoundName = keyof typeof sources;

let players: Record<SoundName, AudioPlayer> | null = null;
let muted = false;

// Preload every effect into its own player. Safe to call more than once.
export function initSounds(): void {
  if (players) return;
  setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  const map = {} as Record<SoundName, AudioPlayer>;
  (Object.keys(sources) as SoundName[]).forEach((key) => {
    try {
      map[key] = createAudioPlayer(sources[key]);
    } catch {
      // ignore — audio just won't play for this effect
    }
  });
  players = map;
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function getMuted(): boolean {
  return muted;
}

export function playSound(name: SoundName): void {
  if (muted || !players) return;
  const p = players[name];
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {
    // ignore playback errors
  }
}
