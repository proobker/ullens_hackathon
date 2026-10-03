import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDatabase } from './storage/database.js';
import { seedDatabase } from './storage/seed.js';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const databasePath = resolve(workspaceRoot, process.env.DATABASE_PATH ?? '.data/pran-rekha-demo.sqlite');
const fixtureDirectory = resolve(workspaceRoot, process.env.PRIVATE_DOCUMENT_PATH ?? 'fixtures/documents');
const database = openDatabase({ databasePath });
const count = database.prepare('SELECT COUNT(*) AS count FROM patients').get() as { count: number };
if (count.count === 0) seedDatabase(database, fixtureDirectory);

const port = Number(process.env.PORT ?? 4100);
const app = createApp({ database });
const server = app.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Pran Rekha API listening at http://127.0.0.1:${port}\n`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
