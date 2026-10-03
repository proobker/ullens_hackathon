// Renders assets/icon.png (square-ish mark) into the PWA, Apple and favicon icons, and
// assets/logo-wordmark.png into the web-sized wordmark used in the header and offline page.
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const asset = name => {
  const path = join(root, 'assets', name);
  if (!existsSync(path)) throw new Error(`Missing assets/${name}.`);
  return path;
};
const icon = asset('icon.png');
const wordmark = asset('logo-wordmark.png');
const icons = join(root, 'public', 'icons');
const brand = join(root, 'public', 'brand');
mkdirSync(icons, { recursive: true });
mkdirSync(brand, { recursive: true });
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const white = '#ffffff';

const fit = (size, scale) => sharp(icon).resize(Math.round(size * scale), Math.round(size * scale), { fit: 'contain', background: transparent }).png().toBuffer();
// The mark is wide and red, so every launcher icon sits on a white square with padding.
const onWhite = async (size, file, scale) => {
  await sharp({ create: { width: size, height: size, channels: 4, background: white } })
    .composite([{ input: await fit(size, scale), gravity: 'center' }]).png().toFile(join(icons, file));
};

await Promise.all([
  onWhite(192, 'icon-192.png', 0.78),
  onWhite(512, 'icon-512.png', 0.78),
  onWhite(512, 'maskable-512.png', 0.62),
  onWhite(180, 'apple-touch-icon.png', 0.76),
  sharp(icon).resize(32, 32, { fit: 'contain', background: transparent }).png().toFile(join(icons, 'favicon-32.png')),
  sharp(wordmark).trim().resize({ width: 960 }).png({ compressionLevel: 9 }).toFile(join(brand, 'pranrekha-logo.png'))
]);
console.log(`Icons written to ${icons}, wordmark to ${brand}`);
