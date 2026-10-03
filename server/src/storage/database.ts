import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

// esbuild versions used by tsup can incorrectly rewrite the newer `node:sqlite`
// specifier to the nonexistent npm package `sqlite`. Keep this runtime import
// dynamic until the bundler recognizes the Node 24 builtin.
const sqliteSpecifier = ['node', 'sqlite'].join(':');
const { DatabaseSync } = await import(sqliteSpecifier) as typeof import('node:sqlite');

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

export type DatabaseOptions = { databasePath: string };

export function openDatabase(options: DatabaseOptions): DatabaseSyncType {
  const absolutePath = resolve(options.databasePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const database = new DatabaseSync(absolutePath);
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const adjacentMigration = resolve(moduleDirectory, 'migrations/001_initial.sql');
  const sourceMigration = resolve(process.cwd(), 'src/storage/migrations/001_initial.sql');
  const repositoryMigration = resolve(process.cwd(), 'server/src/storage/migrations/001_initial.sql');
  const migrationPath = [adjacentMigration, sourceMigration, repositoryMigration].find(existsSync);
  if (!migrationPath) throw new Error('Database migration 001_initial.sql could not be found.');
  const migration = readFileSync(migrationPath, 'utf8');
  database.exec(migration);
  return database;
}

export function withTransaction<T>(database: DatabaseSyncType, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

