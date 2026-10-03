import { z } from 'zod';
export const id = z.string().min(1).max(128);
export const EntrySchema = z.object({
  id, kind: z.enum(['blood_group', 'allergy', 'condition', 'implant', 'donor', 'vital', 'medication', 'contact', 'report']),
  text: z.string().min(1).max(2000), date: z.iso.date(), source: z.string().min(1).max(300),
  excerpt: z.string().min(1).max(4000), author: id, reviewed: z.boolean(),
}).strict();
export type Entry = z.infer<typeof EntrySchema>;
export const ClinicalVersionSchema = z.object({
  id, patientId: id, revision: z.number().int().positive(), facility: z.string(), signer: z.string(),
  signedAt: z.iso.datetime(), reviewDue: z.iso.datetime(), entries: z.array(EntrySchema).max(100),
  signature: z.string(), publicKey: z.string(),
}).strict();
export type ClinicalVersion = z.infer<typeof ClinicalVersionSchema>;
export const MutationSchema = z.object({ requestId: id, expectedRevision: z.number().int().nonnegative() });
export const SignRequestSchema = MutationSchema.extend({
  entries: z.array(EntrySchema.omit({ id: true, author: true, reviewed: true })).min(1).max(100),
}).strict();
export const ReleaseRequestSchema = MutationSchema.extend({ allowedEntryIds: z.array(id).max(200) }).strict();
export const ScanSchema = z.object({
  version: z.literal(1), deviceId: id, eventId: id,
  tagUid: z.string().regex(/^(?:[A-Fa-f0-9]{8}|[A-Fa-f0-9]{14}|[A-Fa-f0-9]{20})$/).transform(v => v.toUpperCase()),
}).strict();
export const GrantRequestSchema = z.object({
  requestId: id, patientId: id, linkageId: id, purpose: z.string().min(5).max(500),
  deviceId: id, confirmed: z.literal(true),
}).strict();
export const DispatchRequestSchema = z.object({
  requestId: id, grantId: id, destination: id, etaMinutes: z.number().int().min(0).max(240),
}).strict();
export const CardSchema = z.object({
  patientId: id, name: z.string(), entries: z.array(EntrySchema), notice: z.string(),
  generatedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), receiptId: id,
}).strict();
export type Card = z.infer<typeof CardSchema>;
export const AlertSchema = z.object({
  id, patientId: id, destination: id, unit: z.string(), etaMinutes: z.number(), timestamp: z.iso.datetime(),
  status: z.enum(['EN_ROUTE', 'ARRIVED', 'RESOLVED']), revision: z.number().int(), card: CardSchema,
}).strict();
export type Alert = z.infer<typeof AlertSchema>;
export const PlatformProfileSchema = z.object({
  id, name: z.string(), dob: z.iso.date(), locator: z.string(), revision: z.number().int(),
  entries: z.array(EntrySchema), versions: z.array(ClinicalVersionSchema),
  release: z.object({ revision: z.number().int(), allowedEntryIds: z.array(id), revoked: z.boolean() }),
  reviewDue: z.iso.datetime(), freshness: z.enum(['FRESH', 'AGING', 'EXPIRED']),
}).strict();
export type PlatformProfile = z.infer<typeof PlatformProfileSchema>;
export const BloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const RegisterPatientSchema = z.object({
  requestId: id, name: z.string().trim().min(1).max(120), dob: z.iso.date(),
  bloodGroup: z.enum(BloodGroups).optional(), allergies: z.string().trim().min(1).max(500).optional(),
  tagUid: ScanSchema.shape.tagUid.optional(),
  username: z.string().regex(/^[a-z0-9_-]{3,32}$/), password: z.string().min(12).max(128),
  photo: z.string().max(700_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
  descriptor: z.array(z.number().finite()).length(128),
}).strict();
export type RegisterPatientRequest = z.input<typeof RegisterPatientSchema>;
export type RegisteredPatient = { patientId: string; name: string; locator: string; username: string };
export type FaceGalleryEntry = { patientId: string; name: string; descriptor: number[] };
export const HandwrittenUpdateSchema = MutationSchema.extend({
  image: z.string().max(2_000_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
  ocrText: z.string().max(8000), engine: z.string().min(1).max(100),
  entries: z.array(z.object({
    kind: EntrySchema.shape.kind.exclude(['report', 'donor', 'contact']), text: z.string().trim().min(1).max(2000),
    original: z.string().max(2000), date: z.iso.date(),
  }).strict()).min(1).max(50),
}).strict();
export type HandwrittenUpdateRequest = z.input<typeof HandwrittenUpdateSchema>;
