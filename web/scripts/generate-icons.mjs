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
