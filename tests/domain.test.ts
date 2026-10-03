import { describe, expect, it } from 'vitest';
import type { MedicationEvent, MedicationRecord } from '@pran-rekha/contracts';
import {
  classifyEvidence,
  derivePrescriptionView,
  preserveClinicalDate,
  validateSourceReference
} from '@pran-rekha/domain';

const source = {
  id: 'source_1', patientId: 'patient_1', version: 1,
  sha256: 'a'.repeat(64), content: 'prefix exact evidence suffix', pageCount: 1
};
const reference = {
  kind: 'text' as const, sourceId: 'source_1', version: 1,
  sha256: 'a'.repeat(64), page: 1, start: 7, end: 21
};
const day = {
  rawText: '2026-09-28', calendar: 'AD' as const, precision: 'day' as const,
  adDate: '2026-09-28', instant: null, sourceTimezone: null,
  conversionVersion: null, confirmedBy: 'actor_1'
};
const medication: MedicationRecord = {
  id: 'med_1', patientId: 'patient_1', prescriptionStreamId: 'stream_1',
  drug: { rawText: 'Metformin', genericName: null, resolution: 'verbatim', aliasEntryId: null, aliasTableVersion: null },
  doseText: '५०० mg', frequencyText: '1-0-1', routeText: null, durationText: 'five days',
  startDate: day, endDate: null, prescriberText: null, organisationText: null,
  sourceRefs: [reference], recordedAt: '2026-09-28T04:30:00.000Z', mode: 'synthetic_fixture'
};

function statusEvent(state: 'documented_active' | 'unknown'): MedicationEvent {
  return {
    id: 'event_1', patientId: 'patient_1', prescriptionStreamId: 'stream_1', recordId: 'med_1',
    kind: 'status_confirmed', confirmedState: state, effectiveDate: day,
    recordedAt: '2026-09-28T04:30:00.000Z', actorId: 'actor_1', actorRole: 'clinician',
    authority: 'prescription_document', sourceRefs: [reference], revision: 1, requestId: 'request_1'
  };
}

describe('source references', () => {
  it('accepts an exact source span', () => {
    expect(() => validateSourceReference(source, 'patient_1', reference)).not.toThrow();
    expect(source.content.slice(reference.start, reference.end)).toBe('exact evidence');
  });

  it('rejects cross-patient and out-of-range evidence', () => {
    expect(() => validateSourceReference(source, 'patient_2', reference)).toThrow('PATIENT_MISMATCH');
    expect(() => validateSourceReference(source, 'patient_1', { ...reference, end: 100 })).toThrow('SOURCE_UNRESOLVED');
  });
});

describe('evidence ordering', () => {
  it('excludes unauthorized evidence before classification', () => {
    expect(classifyEvidence({ authorised: false, provenanceValid: true, conflict: true, missingContext: true, reviewedIndependentOrigins: 2 })).toBeNull();
  });

  it('keeps conflict ahead of documentary agreement', () => {
    expect(classifyEvidence({ authorised: true, provenanceValid: true, conflict: true, missingContext: false, reviewedIndependentOrigins: 2 })).toBe('CONFLICT');
  });
});

describe('prescription derivation', () => {
  it('derives documented active only from explicit status evidence', () => {
    const view = derivePrescriptionView(medication, [statusEvent('documented_active')], '2026-10-03T04:30:00.000Z');
    expect(view.state).toBe('documented_active');
    expect(view.doseText).toBe('५०० mg');
    expect(view.frequencyText).toBe('1-0-1');
    expect(view.endDate).toBeNull();
  });

  it('leaves status unknown when status evidence is missing', () => {
    const view = derivePrescriptionView(medication, [], '2026-10-03T04:30:00.000Z');
    expect(view.state).toBe('unknown');
    expect(view.basis).toContain('No explicit');
  });

  it('preserves year-only precision without inventing a date', () => {
    expect(preserveClinicalDate({ ...day, rawText: '2082 BS', calendar: 'BS', precision: 'year', adDate: null })).toMatchObject({ rawText: '2082 BS', precision: 'year', adDate: null });
  });
});

