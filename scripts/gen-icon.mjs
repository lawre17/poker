// Generates the Kadi app icon — assets/*.png (for prebuild/iOS/web) and the
// Android adaptive launcher mipmaps (*.webp at every density), so the home-grid
// icon is the Kadi card emblem instead of the Expo default.
// Run from the project root:  node scripts/gen-icon.mjs
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import sharp from 'sharp';

const GREEN = '#0b6b3a';
const GREEN_LT = '#0e7d44';
const GREEN_DK = '#074a27';
const GOLD = '#f4c542';
const RED = '#d8362c';
const INK = '#1c1c1c';
const CARD = '#fdfdfb';

const HEART =
  'M50,32 C36,8 2,16 2,42 C2,68 50,92 50,92 C50,92 98,68 98,42 C98,16 64,8 50,32 Z';

function suit(kind, cx, cy, s, fill) {
  const k = s / 100;
  if (kind === 'heart') {
    return `<g transform="translate(${cx},${cy}) scale(${k}) translate(-50,-50)"><path d="${HEART}" fill="${fill}"/></g>`;
  }
  return `<g transform="translate(${cx},${cy}) scale(${k}) translate(-50,-50)">
    <g transform="rotate(180,50,50)"><path d="${HEART}" fill="${fill}"/></g>
    <path d="M50,52 C50,70 40,82 30,90 L70,90 C60,82 50,70 50,52 Z" fill="${fill}"/>
  </g>`;
}

function card(w, h, inner) {
  return `<g>
    <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${w * 0.11}"
      fill="${CARD}" stroke="rgba(0,0,0,0.10)" stroke-width="4"/>
    ${inner}
  </g>`;
}

function emblem(scale) {
  const W = 300,
    H = 430;
  const front = card(
    W,
    H,
    `<text x="0" y="-22" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold"
        font-size="210" fill="${GOLD}" text-anchor="middle" dominant-baseline="middle">K</text>
     ${suit('heart', -52, 120, 78, RED)}
     ${suit('spade', 52, 120, 78, INK)}
     <text x="${-W / 2 + 26}" y="${-H / 2 + 58}" font-family="DejaVu Sans, Arial, sans-serif"
        font-weight="bold" font-size="60" fill="${GOLD}" text-anchor="middle">K</text>`
  );
  return `<g transform="translate(512,512) scale(${scale})">
    <g transform="rotate(13) translate(150,18)">${card(W, H, suit('heart', 0, -70, 90, RED))}</g>
    <g transform="rotate(-9) translate(-40,0)">${front}</g>
  </g>`;
}

const bgDefs = `<defs><radialGradient id="g" cx="42%" cy="36%" r="75%">
    <stop offset="0%" stop-color="${GREEN_LT}"/>
    <stop offset="70%" stop-color="${GREEN}"/>
    <stop offset="100%" stop-color="${GREEN_DK}"/>
  </radialGradient></defs>`;

const svg = {
  full: `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    ${bgDefs}<rect width="1024" height="1024" fill="url(#g)"/>${emblem(1.18)}</svg>`,
  foreground: `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">${emblem(0.92)}</svg>`,
  background: `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    ${bgDefs}<rect width="1024" height="1024" fill="url(#g)"/></svg>`,
  monochrome: `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <text x="512" y="520" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold"
      font-size="620" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">K</text></svg>`,
};

const png = (s, file, size) =>
  sharp(Buffer.from(s)).resize(size, size).png().toFile(file).then(() => console.log('png', file));
const webp = (s, file, size) =>
  sharp(Buffer.from(s)).resize(size, size).webp({ lossless: true }).toFile(file).then(() => console.log('webp', file));

const ROOT = '/home/lawre/code/poker';
const A = `${ROOT}/assets`;
const RES = `${ROOT}/android/app/src/main/res`;

await png(svg.full, `${A}/icon.png`, 1024);
await png(svg.foreground, `${A}/android-icon-foreground.png`, 1024);
await png(svg.background, `${A}/android-icon-background.png`, 1024);
await png(svg.monochrome, `${A}/android-icon-monochrome.png`, 1024);
await png(svg.foreground, `${A}/splash-icon.png`, 1024);
await png(svg.full, `${A}/favicon.png`, 48);

const ADAPT = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, asz] of Object.entries(ADAPT)) {
  const dir = `${RES}/mipmap-${d}`;
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await webp(svg.foreground, `${dir}/ic_launcher_foreground.webp`, asz);
  await webp(svg.background, `${dir}/ic_launcher_background.webp`, asz);
  await webp(svg.monochrome, `${dir}/ic_launcher_monochrome.webp`, asz);
  const lsz = LEGACY[d];
  await webp(svg.full, `${dir}/ic_launcher.webp`, lsz);
  await webp(svg.full, `${dir}/ic_launcher_round.webp`, lsz);
}
console.log('\nicon assets + mipmaps regenerated.');
