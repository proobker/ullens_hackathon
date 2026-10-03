import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.js';
import { DEMO_DATABASE_RELATIVE_PATH, DEMO_MARKER_CONTENT, DEMO_MARKER_RELATIVE_PATH } from './demo-paths.js';
import { seedDatabase } from './seed.js';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const databasePath = resolve(workspaceRoot, process.env.DATABASE_PATH ?? DEMO_DATABASE_RELATIVE_PATH);
const fixtureDirectory = resolve(workspaceRoot, process.env.PRIVATE_DOCUMENT_PATH ?? 'fixtures/documents');
mkdirSync(dirname(resolve(workspaceRoot, DEMO_MARKER_RELATIVE_PATH)), { recursive: true });
writeFileSync(resolve(workspaceRoot, DEMO_MARKER_RELATIVE_PATH), DEMO_MARKER_CONTENT, 'utf8');
const database = openDatabase({ databasePath });
seedDatabase(database, fixtureDirectory);
database.close();
process.stdout.write(`Seeded Pran Rekha synthetic demo at ${databasePath}\n`);

