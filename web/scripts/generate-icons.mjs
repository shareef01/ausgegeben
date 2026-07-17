import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svg = readFileSync(join(publicDir, 'icons', 'icon.svg'));

const sizes = [
  { name: 'favicon-32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

for (const { name, size } of sizes) {
  const out = join(publicDir, name === 'favicon-32.png' ? 'favicon-32.png' : join('icons', name));
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log('wrote', out);
}

// Minimal ICO wrapping 32px PNG (browsers accept PNG favicon via link tag; also copy as favicon.ico)
const fav32 = await sharp(svg).resize(32, 32).png().toBuffer();
writeFileSync(join(publicDir, 'favicon.ico'), fav32);
console.log('wrote favicon.ico');

const BRAND_BG = '#0C0C0E';

// Maskable icon: full-bleed background with the glyph inside the ~80% safe
// zone, so Android launchers (Pixel circles, squircles) never crop the mark.
{
  const inner = await sharp(svg).resize(440, 440).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: BRAND_BG } })
    .composite([{ input: inner, gravity: 'centre' }])
    .png()
    .toFile(join(publicDir, 'icons', 'icon-maskable-512.png'));
  console.log('wrote icons/icon-maskable-512.png');
}

// iOS startup images (apple-touch-startup-image): brand background with a
// centered icon. Sizes cover modern iPhones; index.html maps them via
// device-width/height + pixel-ratio media queries.
const splashes = [
  { w: 750, h: 1334, ratio: 2 },   // iPhone SE 2/3, 8
  { w: 828, h: 1792, ratio: 2 },   // iPhone XR, 11
  { w: 1170, h: 2532, ratio: 3 },  // iPhone 12/13/14
  { w: 1179, h: 2556, ratio: 3 },  // iPhone 14/15/16 Pro, 15/16
  { w: 1284, h: 2778, ratio: 3 },  // iPhone 12/13 Pro Max, 14 Plus
  { w: 1290, h: 2796, ratio: 3 },  // iPhone 14 Pro Max, 15/16 Plus & Pro Max
];

for (const { w, h } of splashes) {
  const iconSize = Math.round(w * 0.28);
  const icon = await sharp(svg).resize(iconSize, iconSize).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: BRAND_BG } })
    .composite([{ input: icon, gravity: 'centre' }])
    .png()
    .toFile(join(publicDir, 'icons', `splash-${w}x${h}.png`));
  console.log(`wrote icons/splash-${w}x${h}.png`);
}
