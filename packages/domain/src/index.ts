import {
  ClinicalDateSchema,
  type EvidenceLabel,
  type MedicationEvent,
  type MedicationRecord,
  type PrescriptionView,
  type SourceRef
} from '@pran-rekha/contracts';

export type StoredSource = {
  id: string;
  patientId: string;
  version: number;
  sha256: string;
  content: string;
  pageCount: number;
};

export function validateSourceReference(source: StoredSource, patientId: string, reference: SourceRef): void {
  if (source.patientId !== patientId) throw new Error('PATIENT_MISMATCH');
  if (source.id !== reference.sourceId || source.version !== reference.version || source.sha256 !== reference.sha256) {
    throw new Error('SOURCE_UNRESOLVED');
  }
  if ('page' in reference && reference.page > source.pageCount) throw new Error('SOURCE_UNRESOLVED');
  if (reference.kind === 'text') {
    if (reference.start < 0 || reference.end > source.content.length || reference.end <= reference.start) {
      throw new Error('SOURCE_UNRESOLVED');
    }
  }
}

export type EvidenceFacts = {
  authorised: boolean;
  provenanceValid: boolean;
  conflict: boolean;
  medicationState?: PrescriptionView['state'];
  missingContext: boolean;
  reviewedIndependentOrigins: number;
};

export function classifyEvidence(facts: EvidenceFacts): EvidenceLabel | null {
  if (!facts.authorised) return null;
  if (!facts.provenanceValid) throw new Error('SOURCE_UNRESOLVED');
  if (facts.conflict) return 'CONFLICT';
  if (facts.medicationState && ['stopped', 'completed', 'held', 'superseded', 'course_end_passed'].includes(facts.medicationState)) {
    return 'HISTORICAL_OR_HELD';
  }
  if (facts.missingContext) return 'CONTEXT_INCOMPLETE';
  if (facts.reviewedIndependentOrigins >= 2) return 'CORROBORATED_RECORD';
  return 'RECORDED_CLAIM';
}

function effectiveTime(event: MedicationEvent): number | null {
  const date = event.effectiveDate;
  if (date.instant) return Date.parse(date.instant);
  if (date.adDate) return Date.parse(`${date.adDate}T00:00:00.000Z`);
  return null;
}

export function derivePrescriptionView(record: MedicationRecord, events: MedicationEvent[], asOf: string): PrescriptionView {
  const asOfTime = Date.parse(asOf);
  if (!Number.isFinite(asOfTime)) throw new Error('INVALID_AS_OF');

  const streamEvents = events
    .filter((event) => event.patientId === record.patientId && event.prescriptionStreamId === record.prescriptionStreamId && event.recordId === record.id)
    .filter((event) => {
      const time = effectiveTime(event);
      return time !== null && time <= asOfTime;
    })
    .sort((left, right) => effectiveTime(left)! - effectiveTime(right)!);

  let state: PrescriptionView['state'] = 'unknown';
  let basis = 'No explicit current-status evidence is recorded.';
  let basisEventIds: string[] = [];

  const endDate = record.endDate?.adDate;
  if (endDate && Date.parse(`${endDate}T23:59:59.999Z`) < asOfTime) {
    state = 'course_end_passed';
    basis = 'The documented course end has passed; actual use remains unknown.';
  }

  const latest = streamEvents.at(-1);
  if (latest) {
    basisEventIds = [latest.id];
    switch (latest.kind) {
      case 'started':
      case 'resumed':
        state = 'documented_active';
        basis = 'An authorised source explicitly records the prescription as active.';
        break;
      case 'status_confirmed':
        state = latest.confirmedState ?? 'unknown';
        basis = state === 'documented_active'
          ? 'An authorised source explicitly confirms active prescription status.'
          : 'The latest status confirmation records the state as unknown.';
        break;
      case 'stopped':
      case 'held':
      case 'completed':
        state = latest.kind;
        basis = `The latest authorised event records the prescription as ${latest.kind}.`;
        break;
    }
  }

  if (latest) {
    const simultaneous = streamEvents.filter(event => effectiveTime(event) === effectiveTime(latest));
    const instructions = new Set(simultaneous.map(event => event.kind === 'status_confirmed' ? event.confirmedState : event.kind === 'started' || event.kind === 'resumed' ? 'documented_active' : event.kind));
    if (instructions.size > 1) {
      state = 'conflict'; basis = 'Incompatible effective instructions have no reliable order.';
      basisEventIds = simultaneous.map(event => event.id);
    }
  }
  if (endDate && endDate < asOf.slice(0,10) && state === 'documented_active') {
    state = 'course_end_passed'; basis = 'Documented end date bounds this prescription; actual use is unknown.';
  }

  return {
    recordId: record.id,
    prescriptionStreamId: record.prescriptionStreamId,
    state,
    basis,
    basisEventIds,
    drug: record.drug,
    doseText: record.doseText,
    frequencyText: record.frequencyText,
    startDate: record.startDate,
    endDate: record.endDate,
    asOf,
    sourceRevision: Math.max(0, ...streamEvents.map((event) => event.revision))
  };
}

export function preserveClinicalDate(value: unknown) {
  return ClinicalDateSchema.parse(value);
}
