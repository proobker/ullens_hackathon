import { z } from 'zod';

export const IdSchema = z.string().min(1).max(128);
export const InstantSchema = z.string().datetime({ offset: true });
export const ADDateSchema = z.iso.date();

export const ActorRoleSchema = z.enum(['patient', 'caregiver', 'clinician', 'paramedic', 'admin']);
export type ActorRole = z.infer<typeof ActorRoleSchema>;

export const DataModeSchema = z.enum(['synthetic_fixture', 'user_uploaded']);
export type DataMode = z.infer<typeof DataModeSchema>;

export const ClinicalDateSchema = z
  .object({
    rawText: z.string().min(1),
    calendar: z.enum(['AD', 'BS', 'unknown']),
    precision: z.enum(['instant', 'day', 'month', 'year', 'unknown']),
    adDate: ADDateSchema.nullable(),
    instant: InstantSchema.nullable(),
    sourceTimezone: z.string().min(1).nullable(),
    conversionVersion: z.string().min(1).nullable(),
    confirmedBy: IdSchema.nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.precision === 'instant' && value.instant === null) {
      context.addIssue({ code: 'custom', message: 'Instant precision requires an instant.' });
    }
    if (value.precision !== 'instant' && value.instant !== null) {
      context.addIssue({ code: 'custom', message: 'Only instant precision may include an instant.' });
    }
    if ((value.precision === 'month' || value.precision === 'year' || value.precision === 'unknown') && value.adDate !== null) {
      context.addIssue({ code: 'custom', message: 'Partial dates cannot invent a full AD date.' });
    }
  });
export type ClinicalDate = z.infer<typeof ClinicalDateSchema>;

export const TextSourceRefSchema = z
  .object({
    kind: z.literal('text'),
    sourceId: IdSchema,
    version: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    page: z.number().int().positive(),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive()
  })
  .strict()
  .refine((value) => value.end > value.start, { message: 'Text source end must follow start.' });

export const ImageSourceRefSchema = z
  .object({
    kind: z.literal('image'),
    sourceId: IdSchema,
    version: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    page: z.number().int().positive(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1)
  })
  .strict()
  .refine((value) => value.x + value.width <= 1 && value.y + value.height <= 1, {
    message: 'Image source box must remain inside the page.'
  });

export const AttestationSourceRefSchema = z
  .object({
    kind: z.literal('attestation'),
    sourceId: IdSchema,
    version: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    field: z.string().min(1)
  })
  .strict();

export const SourceRefSchema = z.discriminatedUnion('kind', [
  TextSourceRefSchema,
  ImageSourceRefSchema,
  AttestationSourceRefSchema
]);
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const ClaimValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('blood_group'), text: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('allergy'), substanceText: z.string().min(1), reactionText: z.string().min(1).nullable() }).strict(),
  z.object({ kind: z.literal('condition'), text: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('procedure'), text: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('immunization'), text: z.string().min(1) }).strict(),
  z.object({
    kind: z.literal('lab_result'),
    testText: z.string().min(1),
    valueText: z.string().min(1),
    unitText: z.string().min(1).nullable(),
    referenceRangeText: z.string().min(1).nullable()
  }).strict(),
  z.object({
    kind: z.literal('contact'),
    name: z.string().min(1),
    relationshipText: z.string().min(1),
    contactText: z.string().min(1)
  }).strict()
]);

export const OriginSchema = z.object({
  originGroupId: IdSchema,
  statedOrganisation: z.string().min(1).nullable(),
  organisationId: IdSchema.nullable(),
  submitterId: IdSchema,
  issuerStatus: z.enum(['as_stated', 'demo_verified']),
  independence: z.enum(['unknown', 'reviewed_independent', 'copied']),
  derivedFromSourceIds: z.array(IdSchema)
}).strict();

export const ClaimSchema = z.object({
  id: IdSchema,
  patientId: IdSchema,
  value: ClaimValueSchema,
  clinicalDate: ClinicalDateSchema,
  recordedAt: InstantSchema,
  sourceRefs: z.array(SourceRefSchema).min(1),
  origin: OriginSchema,
  mode: DataModeSchema,
  extraction: z.enum(['manual', 'ocr_candidate', 'model_candidate']),
  confirmation: z.object({ actorId: IdSchema, at: InstantSchema, sourceVersion: z.number().int().positive() }).strict(),
  supersedesClaimId: IdSchema.nullable()
}).strict();
export type Claim = z.infer<typeof ClaimSchema>;

export const DrugRefSchema = z.object({
  rawText: z.string().min(1),
  genericName: z.string().min(1).nullable(),
  resolution: z.enum(['verbatim', 'reviewed_alias', 'unresolved']),
  aliasEntryId: IdSchema.nullable(),
  aliasTableVersion: z.string().min(1).nullable()
}).strict().superRefine((value, context) => {
  if (value.resolution === 'reviewed_alias' && (!value.aliasEntryId || !value.aliasTableVersion || !value.genericName)) {
    context.addIssue({ code: 'custom', message: 'Reviewed aliases require alias metadata.' });
  }
});

export const MedicationRecordSchema = z.object({
  id: IdSchema,
  patientId: IdSchema,
  prescriptionStreamId: IdSchema,
  drug: DrugRefSchema,
  doseText: z.string().min(1),
  frequencyText: z.string().min(1),
  routeText: z.string().min(1).nullable(),
  durationText: z.string().min(1).nullable(),
  startDate: ClinicalDateSchema.nullable(),
  endDate: ClinicalDateSchema.nullable(),
  prescriberText: z.string().min(1).nullable(),
  organisationText: z.string().min(1).nullable(),
  sourceRefs: z.array(SourceRefSchema).min(1),
  recordedAt: InstantSchema,
  mode: DataModeSchema
}).strict();
export type MedicationRecord = z.infer<typeof MedicationRecordSchema>;

export const MedicationEventSchema = z.object({
  id: IdSchema,
  patientId: IdSchema,
  prescriptionStreamId: IdSchema,
  recordId: IdSchema,
  kind: z.enum(['started', 'stopped', 'held', 'resumed', 'completed', 'status_confirmed']),
  confirmedState: z.enum(['documented_active', 'unknown']).nullable(),
  effectiveDate: ClinicalDateSchema,
  recordedAt: InstantSchema,
  actorId: IdSchema,
  actorRole: ActorRoleSchema,
  authority: z.enum(['prescription_document', 'clinician_attestation']),
  sourceRefs: z.array(SourceRefSchema).min(1),
  revision: z.number().int().positive(),
  requestId: IdSchema
}).strict().superRefine((value, context) => {
  if (value.kind === 'status_confirmed' && value.confirmedState === null) {
    context.addIssue({ code: 'custom', message: 'Status confirmation requires a state.' });
  }
  if (value.kind !== 'status_confirmed' && value.confirmedState !== null) {
    context.addIssue({ code: 'custom', message: 'Only status confirmation may carry a state.' });
  }
});
export type MedicationEvent = z.infer<typeof MedicationEventSchema>;

export const MedStateSchema = z.enum([
  'documented_active', 'unknown', 'held', 'stopped', 'completed', 'course_end_passed', 'superseded', 'conflict'
]);
export type MedState = z.infer<typeof MedStateSchema>;

export const PrescriptionViewSchema = z.object({
  recordId: IdSchema,
  prescriptionStreamId: IdSchema,
  state: MedStateSchema,
  basis: z.string().min(1),
  basisEventIds: z.array(IdSchema),
  drug: DrugRefSchema,
  doseText: z.string().min(1),
  frequencyText: z.string().min(1),
  startDate: ClinicalDateSchema.nullable(),
  endDate: ClinicalDateSchema.nullable(),
  asOf: InstantSchema,
  sourceRevision: z.number().int().nonnegative()
}).strict();
export type PrescriptionView = z.infer<typeof PrescriptionViewSchema>;

export const EvidenceLabelSchema = z.enum([
  'CONFLICT', 'HISTORICAL_OR_HELD', 'CONTEXT_INCOMPLETE', 'CORROBORATED_RECORD', 'RECORDED_CLAIM'
]);
export type EvidenceLabel = z.infer<typeof EvidenceLabelSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum(['INVALID_INPUT', 'FORBIDDEN', 'SOURCE_UNRESOLVED', 'PATIENT_MISMATCH', 'CONFLICT']),
    message: z.string(),
    retryable: z.boolean()
  }).strict(),
  requestId: IdSchema
}).strict();

export const SessionRequestSchema = z.object({ username: z.string().min(1), password: z.string().min(1) }).strict();
export const SessionResponseSchema = z.object({
  actor: z.object({ id: IdSchema, displayName: z.string(), role: ActorRoleSchema }).strict(),
  patientIds: z.array(IdSchema),
  mode: z.literal('synthetic_fixture')
}).strict();

export const TimelineResponseSchema = z.object({
  patient: z.object({ id: IdSchema, displayName: z.string(), alternateName: z.string().nullable() }).strict(),
  claims: z.array(ClaimSchema),
  evidenceLabels: z.record(IdSchema, EvidenceLabelSchema),
  mode: z.literal('synthetic_fixture')
}).strict();

export const PrescriptionsResponseSchema = z.object({
  prescriptions: z.array(PrescriptionViewSchema),
  mode: z.literal('synthetic_fixture')
}).strict();

export const DocumentPreviewResponseSchema = z.object({
  document: z.object({ id: IdSchema, version: z.number().int().positive(), title: z.string(), content: z.string(), sha256: z.string() }).strict(),
  mode: z.literal('synthetic_fixture')
}).strict();

export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type TimelineResponse = z.infer<typeof TimelineResponseSchema>;
export type PrescriptionsResponse = z.infer<typeof PrescriptionsResponseSchema>;
export type DocumentPreviewResponse = z.infer<typeof DocumentPreviewResponseSchema>;

