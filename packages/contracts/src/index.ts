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

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum(['INVALID_INPUT', 'FORBIDDEN', 'CONFLICT']),
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

export type SessionResponse = z.infer<typeof SessionResponseSchema>;

