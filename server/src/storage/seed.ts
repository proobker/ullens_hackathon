import { createHash, scryptSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Claim, MedicationEvent, MedicationRecord } from '@pran-rekha/contracts';
import { withTransaction } from './database.js';

export const DEMO_CLOCK = '2026-10-03T04:30:00.000Z';
export const PRIMARY_PATIENT_ID = 'patient_maya_001';
export const SECONDARY_PATIENT_ID = 'patient_maiya_002';
export const PRIMARY_ACTOR_ID = 'actor_patient_maya';
export const CLINICIAN_ACTOR_ID = 'actor_clinician_demo';
export const DOCUMENT_ID = 'document_discharge_001';
export const CLAIM_ID = 'claim_allergy_001';
export const MEDICATION_ID = 'medication_metformin_001';

export const DEMO_CREDENTIALS = {
  patient: { username: 'maya.patient', password: 'pran-demo-patient' },
  clinician: { username: 'demo.clinician', password: 'pran-demo-clinician' }
} as const;

export const DOCUMENT_CONTENT = [
  'PRAN REKHA — SYNTHETIC DEMONSTRATION RECORD',
  'Fictional provider: Himal Demo Clinic',
  'Patient: Maya Shrestha',
  'Recorded allergy: Amoxicillin — rash reported.',
  'Prescription: Metformin ५०० mg, frequency 1-0-1.',
  'This document contains no real patient information.'
].join('\n');

export const ALLERGY_EXCERPT = 'Recorded allergy: Amoxicillin — rash reported.';

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function seedDatabase(database: DatabaseSync, fixtureDirectory: string): void {
  const absoluteFixtureDirectory = resolve(fixtureDirectory);
  mkdirSync(absoluteFixtureDirectory, { recursive: true });
  const documentPath = resolve(absoluteFixtureDirectory, 'synthetic-discharge.txt');
  let content = DOCUMENT_CONTENT;
  try {
    content = readFileSync(documentPath, 'utf8').replace(/\r\n/g, '\n').trimEnd();
  } catch {
    writeFileSync(documentPath, DOCUMENT_CONTENT, 'utf8');
  }

  if (content !== DOCUMENT_CONTENT) {
    throw new Error('The synthetic source fixture does not match its frozen manifest.');
  }

  const sourceHash = sha256(content);
  const sourceStart = content.indexOf(ALLERGY_EXCERPT);
  if (sourceStart < 0) throw new Error('Frozen source excerpt is missing.');

  const clinicalDate = {
    rawText: '2026-09-28', calendar: 'AD' as const, precision: 'day' as const,
    adDate: '2026-09-28', instant: null, sourceTimezone: null, conversionVersion: null,
    confirmedBy: PRIMARY_ACTOR_ID
  };
  const sourceRef = {
    kind: 'text' as const, sourceId: DOCUMENT_ID, version: 1, sha256: sourceHash,
    page: 1, start: sourceStart, end: sourceStart + ALLERGY_EXCERPT.length
  };

  const claim: Claim = {
    id: CLAIM_ID,
    patientId: PRIMARY_PATIENT_ID,
    value: { kind: 'allergy', substanceText: 'Amoxicillin', reactionText: 'rash reported' },
    clinicalDate,
    recordedAt: DEMO_CLOCK,
    sourceRefs: [sourceRef],
    origin: {
      originGroupId: 'origin_himal_demo_001',
      statedOrganisation: 'Himal Demo Clinic',
      organisationId: null,
      submitterId: PRIMARY_ACTOR_ID,
      issuerStatus: 'as_stated',
      independence: 'unknown',
      derivedFromSourceIds: []
    },
    mode: 'synthetic_fixture',
    extraction: 'manual',
    confirmation: { actorId: PRIMARY_ACTOR_ID, at: DEMO_CLOCK, sourceVersion: 1 },
    supersedesClaimId: null
  };

  const medication: MedicationRecord = {
    id: MEDICATION_ID,
    patientId: PRIMARY_PATIENT_ID,
    prescriptionStreamId: 'stream_metformin_001',
    drug: { rawText: 'Metformin', genericName: null, resolution: 'verbatim', aliasEntryId: null, aliasTableVersion: null },
    doseText: '५०० mg',
    frequencyText: '1-0-1',
    routeText: null,
    durationText: 'until review',
    startDate: clinicalDate,
    endDate: null,
    prescriberText: 'Dr Demo',
    organisationText: 'Himal Demo Clinic',
    sourceRefs: [sourceRef],
    recordedAt: DEMO_CLOCK,
    mode: 'synthetic_fixture'
  };

  const event: MedicationEvent = {
    id: 'event_metformin_status_001',
    patientId: PRIMARY_PATIENT_ID,
    prescriptionStreamId: medication.prescriptionStreamId,
    recordId: medication.id,
    kind: 'status_confirmed',
    confirmedState: 'documented_active',
    effectiveDate: clinicalDate,
    recordedAt: DEMO_CLOCK,
    actorId: 'actor_clinician_fixture_author',
    actorRole: 'clinician',
    authority: 'prescription_document',
    sourceRefs: [sourceRef],
    revision: 1,
    requestId: 'seed_request_001'
  };

  withTransaction(database, () => {
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
    database.prepare('INSERT INTO documents (id, patient_id, version, title, mime_type, sha256, storage_path, content, page_count, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(DOCUMENT_ID, PRIMARY_PATIENT_ID, 1, 'Synthetic discharge summary', 'text/plain', sourceHash, documentPath, content, 1, 'synthetic_fixture');
    database.prepare('INSERT INTO claims (id, patient_id, value_json, clinical_date_json, recorded_at, source_refs_json, origin_json, mode, extraction, confirmation_json, supersedes_claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(claim.id, claim.patientId, JSON.stringify(claim.value), JSON.stringify(claim.clinicalDate), claim.recordedAt, JSON.stringify(claim.sourceRefs), JSON.stringify(claim.origin), claim.mode, claim.extraction, JSON.stringify(claim.confirmation), claim.supersedesClaimId);
    database.prepare('INSERT INTO medications (id, patient_id, prescription_stream_id, payload_json) VALUES (?, ?, ?, ?)')
      .run(medication.id, medication.patientId, medication.prescriptionStreamId, JSON.stringify(medication));
    database.prepare('INSERT INTO medication_events (id, patient_id, prescription_stream_id, record_id, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(event.id, event.patientId, event.prescriptionStreamId, event.recordId, event.revision, JSON.stringify(event));
  });
}

