// Synthesizes small WAV sound effects for the game (run once with `node`).
// Output: assets/sounds/*.wav  (mono, 44.1kHz, 16-bit PCM)
const fs = require('fs');
const path = require('path');

const SR = 44100;
const OUT = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(OUT, { recursive: true });

function writeWav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE((s * 32767) | 0, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(OUT, name), Buffer.concat([header, data]));
  console.log('wrote', name, samples.length, 'samples');
}

// A tone with an exponential decay envelope.
function tone(freq, durMs, { type = 'sine', decay = 6, gain = 0.5, startMs = 0 } = {}) {
  const n = Math.floor((durMs / 1000) * SR);
  const start = Math.floor((startMs / 1000) * SR);
  const out = new Array(start + n).fill(0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-decay * (i / n));
    let v;
    if (type === 'square') v = Math.sign(Math.sin(2 * Math.PI * freq * t));
    else if (type === 'tri') v = Math.asin(Math.sin(2 * Math.PI * freq * t)) * (2 / Math.PI);
    else v = Math.sin(2 * Math.PI * freq * t);
    out[start + i] += v * env * gain;
  }
  return out;
}

function mix(...layers) {
  const len = Math.max(...layers.map((l) => l.length));
  const out = new Array(len).fill(0);
  for (const l of layers) for (let i = 0; i < l.length; i++) out[i] += l[i];
  return out;
}

function noise(durMs, { decay = 20, gain = 0.4 } = {}) {
  const n = Math.floor((durMs / 1000) * SR);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const env = Math.exp(-decay * (i / n));
    out[i] = (Math.random() * 2 - 1) * env * gain;
  }
  return out;
}

// --- the effects ---

// Card play: a crisp snap (filtered noise + a short blip).
writeWav('play.wav', mix(noise(70, { decay: 28, gain: 0.5 }), tone(520, 70, { decay: 10, gain: 0.25 })));

// Draw a card: a soft low tick.
writeWav('draw.wav', mix(noise(55, { decay: 35, gain: 0.3 }), tone(300, 60, { decay: 12, gain: 0.2 })));

// Skip: a quick descending blip.
writeWav('skip.wav', mix(tone(700, 90, { type: 'tri', decay: 7, gain: 0.4 }), tone(420, 110, { type: 'tri', decay: 7, gain: 0.4, startMs: 70 })));

// Penalty: a buzzy alert.
writeWav('penalty.wav', mix(tone(180, 230, { type: 'square', decay: 4, gain: 0.32 }), tone(120, 230, { type: 'square', decay: 4, gain: 0.2 })));

// Kadi declaration: a bright two-note bell.
writeWav('kadi.wav', mix(tone(880, 320, { decay: 5, gain: 0.4 }), tone(1320, 360, { decay: 5, gain: 0.3, startMs: 110 })));

// Win: an ascending arpeggio C–E–G–C.
writeWav('win.wav', mix(
  tone(523, 160, { decay: 4, gain: 0.4 }),
  tone(659, 160, { decay: 4, gain: 0.4, startMs: 130 }),
  tone(784, 160, { decay: 4, gain: 0.4, startMs: 260 }),
  tone(1046, 420, { decay: 3, gain: 0.45, startMs: 390 }),
));

// Lose / opponent wins: a gentle descending two-note.
writeWav('lose.wav', mix(tone(440, 220, { decay: 5, gain: 0.35 }), tone(330, 360, { decay: 4, gain: 0.32, startMs: 180 })));
