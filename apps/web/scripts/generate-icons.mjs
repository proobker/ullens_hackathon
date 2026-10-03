// Renders assets/logo.(svg|png) into the PWA and Apple touch icons under public/icons.
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = ['logo.svg', 'logo.png'].map(name => join(root, 'assets', name)).find(existsSync);
if (!source) throw new Error('Add assets/logo.svg or assets/logo.png first.');
const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });
const background = '#0d9488';

const plain = (size, file) => sharp(source, { density: 384 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(join(out, file));
// Maskable and Apple icons get cropped or lose transparency, so pad the logo onto a solid square.
const padded = async (size, file, scale) => {
  const inner = Math.round(size * scale);
  const logo = await sharp(source, { density: 384 }).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } }).composite([{ input: logo, gravity: 'center' }]).png().toFile(join(out, file));
};

await Promise.all([
  plain(192, 'icon-192.png'),
  plain(512, 'icon-512.png'),
  plain(32, 'favicon-32.png'),
  padded(512, 'maskable-512.png', 0.8),
  padded(180, 'apple-touch-icon.png', 0.86)
]);
console.log(`Icons written to ${out} from ${source}`);
