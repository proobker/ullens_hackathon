import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_DATABASE_RELATIVE_PATH, DEMO_MARKER_CONTENT, DEMO_MARKER_RELATIVE_PATH, resolveDemoDatabasePath } from './demo-paths.js';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const markerPath = resolve(workspaceRoot, DEMO_MARKER_RELATIVE_PATH);
const candidate = process.env.DATABASE_PATH ?? DEMO_DATABASE_RELATIVE_PATH;
const databasePath = resolveDemoDatabasePath(workspaceRoot, candidate);

if (!existsSync(markerPath) || readFileSync(markerPath, 'utf8') !== DEMO_MARKER_CONTENT) {
  throw new Error('Synthetic demo marker is missing or invalid; reset refused.');
}

for (const path of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`]) {
  if (existsSync(path)) rmSync(path);
}
process.stdout.write(`Reset only the Pran Rekha synthetic database at ${databasePath}\n`);
