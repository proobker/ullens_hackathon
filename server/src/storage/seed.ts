import { scryptSync } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './database.js';

export const DEMO_CLOCK = '2026-10-03T04:30:00.000Z';
export const PRIMARY_PATIENT_ID = 'patient_maya_001';
export const SECONDARY_PATIENT_ID = 'patient_maiya_002';
export const PRIMARY_ACTOR_ID = 'actor_patient_maya';
export const CLINICIAN_ACTOR_ID = 'actor_clinician_demo';

export const DEMO_CREDENTIALS = {
  patient: { username: 'maya.patient', password: 'pran-demo-patient' },
  clinician: { username: 'demo.clinician', password: 'pran-demo-clinician' }
} as const;

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString('hex');
}

export function seedDatabase(database: DatabaseSync): void {
  withTransaction(database, () => {
    for (const table of ['platform_requests','platform_receipts','portal_roles','platform_objects']) {
      if(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) database.exec('DELETE FROM '+table);
    }
    for (const table of ['sessions', 'medication_events', 'medications', 'claims', 'documents', 'actor_patient_bindings', 'actors', 'patients']) {
      database.exec(`DELETE FROM ${table}`);
    }

    const insertPatient = database.prepare('INSERT INTO patients (id, display_name, alternate_name, mode) VALUES (?, ?, ?, ?)');
    insertPatient.run(PRIMARY_PATIENT_ID, 'Maya Shrestha', 'माया श्रेष्ठ', 'synthetic_fixture');
    insertPatient.run(SECONDARY_PATIENT_ID, 'Maiya Shrestha', 'मैया श्रेष्ठ', 'synthetic_fixture');

    const insertActor = database.prepare('INSERT INTO actors (id, username, display_name, role, password_salt, password_hash) VALUES (?, ?, ?, ?, ?, ?)');
    insertActor.run(PRIMARY_ACTOR_ID, DEMO_CREDENTIALS.patient.username, 'Maya Shrestha', 'patient', 'pran-rekha-patient-salt', hashPassword(DEMO_CREDENTIALS.patient.password, 'pran-rekha-patient-salt'));
    insertActor.run(CLINICIAN_ACTOR_ID, DEMO_CREDENTIALS.clinician.username, 'Demo Clinician', 'clinician', 'pran-rekha-clinician-salt', hashPassword(DEMO_CREDENTIALS.clinician.password, 'pran-rekha-clinician-salt'));

    database.prepare('INSERT INTO actor_patient_bindings (actor_id, patient_id) VALUES (?, ?)').run(PRIMARY_ACTOR_ID, PRIMARY_PATIENT_ID);
  });
}

