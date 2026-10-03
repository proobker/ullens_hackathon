import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/src/app';
import { openDatabase } from '../server/src/storage/database';
import { resolveDemoDatabasePath } from '../server/src/storage/demo-paths';
import {
  DEMO_CLOCK,
  DEMO_CREDENTIALS,
  DOCUMENT_ID,
  PRIMARY_PATIENT_ID,
  SECONDARY_PATIENT_ID,
  seedDatabase
} from '../server/src/storage/seed';

describe('authenticated API boundary', () => {
  let directory: string;
  let database: DatabaseSync;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'pran-rekha-'));
    database = openDatabase({ databasePath: join(directory, 'test.sqlite') });
    seedDatabase(database, resolve(process.cwd(), 'fixtures/documents'));
    app = createApp({ database, clock: () => new Date(DEMO_CLOCK), secureCookies: false });
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function patientAgent() {
    const agent = request.agent(app);
    const response = await agent.post('/api/session').send(DEMO_CREDENTIALS.patient);
    expect(response.status).toBe(201);
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
    return agent;
  }

  it('returns the source-linked timeline and derived prescription to the bound patient', async () => {
    const agent = await patientAgent();
    const timeline = await agent.get(`/api/patients/${PRIMARY_PATIENT_ID}/timeline`);
    expect(timeline.status).toBe(200);
    expect(timeline.body.claims[0].value).toMatchObject({ kind: 'allergy', substanceText: 'Amoxicillin' });
    expect(timeline.body.claims[0].sourceRefs[0]).toMatchObject({ sourceId: DOCUMENT_ID, kind: 'text' });

    const prescriptions = await agent.get(`/api/patients/${PRIMARY_PATIENT_ID}/prescriptions`).query({ asOf: DEMO_CLOCK });
    expect(prescriptions.status).toBe(200);
    expect(prescriptions.body.prescriptions[0]).toMatchObject({ state: 'documented_active', doseText: '५०० mg', frequencyText: '1-0-1' });
  });

  it('serves the exact authorised source version', async () => {
    const agent = await patientAgent();
    const response = await agent.get(`/api/documents/${DOCUMENT_ID}/preview`);
    expect(response.status).toBe(200);
    expect(response.body.document.version).toBe(1);
    expect(response.body.document.content).toContain('Recorded allergy: Amoxicillin — rash reported.');
  });

  it('rejects a forged role instead of accepting client-owned authority', async () => {
    const response = await request(app).post('/api/session').send({ ...DEMO_CREDENTIALS.patient, role: 'admin' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('gives cross-patient and nonexistent resources the same denial shape', async () => {
    const agent = await patientAgent();
    const crossPatient = await agent.get(`/api/patients/${SECONDARY_PATIENT_ID}/timeline`).set('x-request-id', 'request-cross');
    const missing = await agent.get('/api/patients/patient_missing/timeline').set('x-request-id', 'request-missing');
    expect(crossPatient.status).toBe(404);
    expect(missing.status).toBe(404);
    expect({ ...crossPatient.body, requestId: 'normalised' }).toEqual({ ...missing.body, requestId: 'normalised' });
  });

  it('denies a provisioned clinician who has no patient-specific grant', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/session').send(DEMO_CREDENTIALS.clinician);
    expect(login.status).toBe(201);
    expect(login.body.patientIds).toEqual([]);
    const response = await agent.get(`/api/patients/${PRIMARY_PATIENT_ID}/timeline`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('FORBIDDEN');
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
