import type { DatabaseSync } from 'node:sqlite';
import {
  ClaimSchema,
  MedicationEventSchema,
  MedicationRecordSchema,
  type ActorRole,
  type Claim,
  type MedicationEvent,
  type MedicationRecord
} from '@pran-rekha/contracts';

type ActorRow = { id: string; username: string; display_name: string; role: ActorRole; password_salt: string; password_hash: string };
type PatientRow = { id: string; display_name: string; alternate_name: string | null };
type DocumentRow = { id: string; patient_id: string; version: number; title: string; sha256: string; content: string; page_count: number };

export class Repository {
  constructor(private readonly database: DatabaseSync) {}

  findActorByUsername(username: string): ActorRow | undefined {
    return this.database.prepare('SELECT id, username, display_name, role, password_salt, password_hash FROM actors WHERE username = ?').get(username) as ActorRow | undefined;
  }

  findActorBySessionHash(tokenHash: string, now: string): Omit<ActorRow, 'password_salt' | 'password_hash' | 'username'> | undefined {
    return this.database.prepare(`
      SELECT actors.id, actors.display_name, actors.role
      FROM sessions JOIN actors ON actors.id = sessions.actor_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(tokenHash, now) as Omit<ActorRow, 'password_salt' | 'password_hash' | 'username'> | undefined;
  }

  createSession(tokenHash: string, actorId: string, createdAt: string, expiresAt: string): void {
    this.database.prepare('INSERT INTO sessions (token_hash, actor_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(tokenHash, actorId, createdAt, expiresAt);
  }

  deleteSession(tokenHash: string): void {
    this.database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  patientIdsForActor(actorId: string): string[] {
    return (this.database.prepare('SELECT patient_id FROM actor_patient_bindings WHERE actor_id = ? ORDER BY patient_id').all(actorId) as { patient_id: string }[]).map((row) => row.patient_id);
  }

  actorCanReadPatient(actorId: string, patientId: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 AS ok FROM actor_patient_bindings WHERE actor_id = ? AND patient_id = ?').get(actorId, patientId));
  }

  getPatient(patientId: string): PatientRow | undefined {
    return this.database.prepare('SELECT id, display_name, alternate_name FROM patients WHERE id = ?').get(patientId) as PatientRow | undefined;
  }

  getClaims(patientId: string): Claim[] {
    const rows = this.database.prepare('SELECT * FROM claims WHERE patient_id = ? ORDER BY recorded_at').all(patientId) as Record<string, unknown>[];
    return rows.map((row) => ClaimSchema.parse({
      id: row.id,
      patientId: row.patient_id,
      value: JSON.parse(String(row.value_json)),
      clinicalDate: JSON.parse(String(row.clinical_date_json)),
      recordedAt: row.recorded_at,
      sourceRefs: JSON.parse(String(row.source_refs_json)),
      origin: JSON.parse(String(row.origin_json)),
      mode: row.mode,
      extraction: row.extraction,
      confirmation: JSON.parse(String(row.confirmation_json)),
      supersedesClaimId: row.supersedes_claim_id
    }));
  }

  getMedications(patientId: string): { record: MedicationRecord; events: MedicationEvent[] }[] {
    const records = this.database.prepare('SELECT payload_json FROM medications WHERE patient_id = ? ORDER BY id').all(patientId) as { payload_json: string }[];
    return records.map((row) => {
      const record = MedicationRecordSchema.parse(JSON.parse(row.payload_json));
      const eventRows = this.database.prepare('SELECT payload_json FROM medication_events WHERE record_id = ? ORDER BY revision').all(record.id) as { payload_json: string }[];
      return { record, events: eventRows.map((eventRow) => MedicationEventSchema.parse(JSON.parse(eventRow.payload_json))) };
    });
  }

  getDocument(documentId: string): DocumentRow | undefined {
    return this.database.prepare('SELECT id, patient_id, version, title, sha256, content, page_count FROM documents WHERE id = ?').get(documentId) as DocumentRow | undefined;
  }
}

