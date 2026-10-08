import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/src/app';
import { openDatabase } from '../server/src/storage/database';
import { resolveDemoDatabasePath } from '../server/src/storage/demo-paths';
import { DEMO_CLOCK, DEMO_CREDENTIALS, PRIMARY_PATIENT_ID, seedDatabase } from '../server/src/storage/seed';

describe('authenticated API boundary', () => {
  let directory: string;
  let database: DatabaseSync;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'pran-rekha-'));
    database = openDatabase({ databasePath: join(directory, 'test.sqlite') });
    seedDatabase(database);
    app = createApp({ database, clock: () => new Date(DEMO_CLOCK), secureCookies: false });
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('issues an HttpOnly session cookie bound to the patient record', async () => {
    const response = await request(app).post('/api/session').send(DEMO_CREDENTIALS.patient);
    expect(response.status).toBe(201);
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(response.body.patientIds).toEqual([PRIMARY_PATIENT_ID]);
  });

  it('accepts any origin listed in PUBLIC_ORIGIN and rejects others', async () => {
    const previous = process.env.PUBLIC_ORIGIN;
    process.env.PUBLIC_ORIGIN = 'http://localhost:5173, https://demo.trycloudflare.com';
    try {
      const tunnel = await request(app).post('/api/session').set('Origin', 'https://demo.trycloudflare.com').send(DEMO_CREDENTIALS.patient);
      expect(tunnel.status).toBe(201);
      const other = await request(app).post('/api/session').set('Origin', 'https://evil.example').send(DEMO_CREDENTIALS.patient);
      expect(other.status).toBe(403);
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = previous;
    }
  });

  it('rejects a forged role instead of accepting client-owned authority', async () => {
    const response = await request(app).post('/api/session').send({ ...DEMO_CREDENTIALS.patient, role: 'admin' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('gives a provisioned clinician no patient bindings by default', async () => {
    const login = await request(app).post('/api/session').send(DEMO_CREDENTIALS.clinician);
    expect(login.status).toBe(201);
    expect(login.body.patientIds).toEqual([]);
  });
});

describe('demo reset path guard', () => {
  it('allows only the named synthetic database', () => {
    const root = resolve('C:/example/pran-rekha');
    expect(resolveDemoDatabasePath(root)).toBe(resolve(root, '.data/pran-rekha-demo.sqlite'));
    expect(() => resolveDemoDatabasePath(root, '.data/other.sqlite')).toThrow('Refusing');
    expect(() => resolveDemoDatabasePath(root, '../unrelated.sqlite')).toThrow('Refusing');
  });
});
