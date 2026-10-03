import {
  DocumentPreviewResponseSchema,
  PrescriptionsResponseSchema,
  SessionResponseSchema,
  TimelineResponseSchema,
  type DocumentPreviewResponse,
  type PrescriptionsResponse,
  type SessionResponse,
  type TimelineResponse
} from '@pran-rekha/contracts';

export type Session = SessionResponse;
export type Timeline = TimelineResponse;
export type Prescriptions = PrescriptionsResponse;
export type DocumentPreview = DocumentPreviewResponse;

async function requestJson(input: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(input, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers }
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const message = typeof body === 'object' && body && 'error' in body
      ? String((body as { error?: { message?: string } }).error?.message ?? 'Request failed.')
      : 'Request failed.';
    throw new Error(message);
  }
  return body;
}

export async function createSession(username: string, password: string): Promise<Session> {
  return SessionResponseSchema.parse(await requestJson('/api/session', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  }));
}

export async function deleteSession(): Promise<void> {
  await requestJson('/api/session', { method: 'DELETE' });
}

export async function getTimeline(patientId: string): Promise<Timeline> {
  return TimelineResponseSchema.parse(await requestJson(`/api/patients/${encodeURIComponent(patientId)}/timeline`));
}

export async function getPrescriptions(patientId: string, asOf: string): Promise<Prescriptions> {
  return PrescriptionsResponseSchema.parse(await requestJson(`/api/patients/${encodeURIComponent(patientId)}/prescriptions?asOf=${encodeURIComponent(asOf)}`));
}

export async function getDocumentPreview(documentId: string): Promise<DocumentPreview> {
  return DocumentPreviewResponseSchema.parse(await requestJson(`/api/documents/${encodeURIComponent(documentId)}/preview`));
}

