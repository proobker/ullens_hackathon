PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  alternate_name TEXT,
  mode TEXT NOT NULL CHECK (mode = 'synthetic_fixture')
);

CREATE TABLE IF NOT EXISTS actors (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patient', 'caregiver', 'clinician', 'admin')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actor_patient_bindings (
  actor_id TEXT NOT NULL REFERENCES actors(id),
  patient_id TEXT NOT NULL REFERENCES patients(id),
  PRIMARY KEY (actor_id, patient_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  content TEXT NOT NULL,
  page_count INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode = 'synthetic_fixture'),
  UNIQUE (id, version)
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  value_json TEXT NOT NULL,
  clinical_date_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  origin_json TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode = 'synthetic_fixture'),
  extraction TEXT NOT NULL,
  confirmation_json TEXT NOT NULL,
  supersedes_claim_id TEXT
);

CREATE TABLE IF NOT EXISTS medications (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  prescription_stream_id TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medication_events (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  prescription_stream_id TEXT NOT NULL,
  record_id TEXT NOT NULL REFERENCES medications(id),
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE (prescription_stream_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_claims_patient ON claims(patient_id);
CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_medications_patient ON medications(patient_id);

