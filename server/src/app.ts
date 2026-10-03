import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  ApiErrorSchema,
  InstantSchema,
  SessionRequestSchema,
  type ActorRole
} from '@pran-rekha/contracts';
import { classifyEvidence, derivePrescriptionView, validateSourceReference } from '@pran-rekha/domain';
import { Repository } from './storage/repository.js';
import { hashPassword } from './storage/seed.js';
import { PlatformStore } from './platform/store.js';
import { platformRouter } from './platform/routes.js';
import { seedMedicationMatrix } from './platform/fixtures.js';

const COOKIE_NAME = 'pran_rekha_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

type AuthenticatedActor = { id: string; display_name: string; role: ActorRole };
type Locals = { requestId: string; actor?: AuthenticatedActor; tokenHash?: string };

export type AppOptions = {
  database: DatabaseSync;
  clock?: () => Date;
  secureCookies?: boolean;
};

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(value.join('='));
  }
  return cookies;
}

function routeParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function errorBody(code: 'INVALID_INPUT' | 'FORBIDDEN' | 'SOURCE_UNRESOLVED' | 'PATIENT_MISMATCH' | 'CONFLICT', message: string, requestId: string) {
  return ApiErrorSchema.parse({ error: { code, message, retryable: false }, requestId });
}

export function createApp(options: AppOptions) {
  const app = express();
  const repository = new Repository(options.database);
  const platform = new PlatformStore(options.database);
  platform.seed();
  seedMedicationMatrix(platform);
  const clock = options.clock ?? (() => new Date());
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === 'production';

  app.disable('x-powered-by');
  app.use(express.json({ limit: '15mb' }));
  app.use((request, response, next) => {
    response.locals.requestId = request.header('x-request-id')?.slice(0, 128) || randomUUID();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  const attempts = new Map<string, { count: number; until: number }>();
  app.use((request, response, next) => {
    if (['POST','PUT','PATCH','DELETE'].includes(request.method)) {
      const origin = request.header('origin');
      // Comma-separated so a phone tunnel origin can be allowed alongside localhost.
      const allowed = (process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173').split(',').map(value => value.trim());
      if (request.header('sec-fetch-site') === 'cross-site' || (origin && !allowed.includes(origin))) {
        response.status(403).json(errorBody('FORBIDDEN','Origin not allowed.',response.locals.requestId)); return;
      }
    }
    next();
  });

  function authenticate(request: Request, response: Response<unknown, Locals>, next: NextFunction) {
    const rawToken = parseCookies(request.header('cookie'))[COOKIE_NAME];
    if (!rawToken) {
      response.status(401).json(errorBody('FORBIDDEN', 'The requested resource is unavailable.', response.locals.requestId));
      return;
    }
    const digest = tokenHash(rawToken);
    const actor = repository.findActorBySessionHash(digest, clock().toISOString());
    if (!actor) {
      response.status(401).json(errorBody('FORBIDDEN', 'The requested resource is unavailable.', response.locals.requestId));
      return;
    }
    response.locals.actor = actor;
    response.locals.tokenHash = digest;
    next();
  }

  function requirePatientAccess(response: Response<unknown, Locals>, patientId: string): boolean {
    const actor = response.locals.actor;
    if (!actor || !repository.actorCanReadPatient(actor.id, patientId)) {
      response.status(404).json(errorBody('FORBIDDEN', 'The requested resource is unavailable.', response.locals.requestId));
      return false;
    }
    return true;
  }

  app.post('/api/session', (request, response: Response<unknown, Locals>) => {
    const key = request.ip ?? 'local';
    const attempt = attempts.get(key);
    if (attempt && attempt.until > clock().getTime() && attempt.count >= 20) {
      response.status(429).json(errorBody('FORBIDDEN','Too many attempts. Try later.',response.locals.requestId)); return;
    }
    attempts.set(key, {count: attempt && attempt.until > clock().getTime() ? attempt.count+1 : 1, until: clock().getTime()+60000});
    const parsed = SessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json(errorBody('INVALID_INPUT', 'Credentials must contain only a username and password.', response.locals.requestId));
      return;
    }
    const actor = repository.findActorByUsername(parsed.data.username);
    const suppliedHash = hashPassword(parsed.data.password, actor?.password_salt ?? 'pran-rekha-invalid-salt');
    const expectedHash = actor?.password_hash ?? '0'.repeat(64);
    const matches = timingSafeEqual(Buffer.from(suppliedHash, 'hex'), Buffer.from(expectedHash, 'hex'));
    if (!actor || !matches) {
      response.status(401).json(errorBody('FORBIDDEN', 'The credentials were not accepted.', response.locals.requestId));
      return;
    }

    const rawToken = randomBytes(32).toString('base64url');
    const createdAt = clock();
    const expiresAt = new Date(createdAt.getTime() + SESSION_DURATION_MS);
    repository.createSession(tokenHash(rawToken), actor.id, createdAt.toISOString(), expiresAt.toISOString());
    response.cookie(COOKIE_NAME, rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
      maxAge: SESSION_DURATION_MS,
      path: '/'
    });
    response.status(201).json({
      actor: { id: actor.id, displayName: actor.display_name, role: platform.staff(actor.id)?.role ?? actor.role },
      patientIds: repository.patientIdsForActor(actor.id),
      mode: 'synthetic_fixture'
    });
  });

  app.get('/api/session', authenticate, (_request, response: Response<unknown, Locals>) => {
    const actor=response.locals.actor!;
    response.json({actor:{id:actor.id,displayName:actor.display_name,role:platform.staff(actor.id)?.role??actor.role},patientIds:repository.patientIdsForActor(actor.id),mode:'synthetic_fixture'});
  });
  app.use('/api/platform', (request,response: Response<unknown, Locals>,next)=>{
    if(request.path==='/rfid/scans' && request.method==='POST') { next(); return; }
    authenticate(request,response,next);
  }, platformRouter(platform,clock));

  app.delete('/api/session', authenticate, (_request, response: Response<unknown, Locals>) => {
    if (response.locals.tokenHash) repository.deleteSession(response.locals.tokenHash);
    response.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/' });
    response.status(204).end();
  });

  app.get('/api/patients/:pid/timeline', authenticate, (request, response: Response<unknown, Locals>) => {
    const patientId = routeParam(request.params.pid);
    if (!patientId || !requirePatientAccess(response, patientId)) return;
    const patient = repository.getPatient(patientId);
    if (!patient) {
      response.status(404).json(errorBody('FORBIDDEN', 'The requested resource is unavailable.', response.locals.requestId));
      return;
    }
    const claims = repository.getClaims(patientId);
    const evidenceLabels: Record<string, string> = {};
    for (const claim of claims) {
      for (const reference of claim.sourceRefs) {
        const source = repository.getDocument(reference.sourceId);
        if (!source) {
          response.status(422).json(errorBody('SOURCE_UNRESOLVED', 'A source reference could not be resolved.', response.locals.requestId));
          return;
        }
        try {
          validateSourceReference({
            id: source.id,
            patientId: source.patient_id,
            version: source.version,
            sha256: source.sha256,
            content: source.content,
            pageCount: source.page_count
          }, patientId, reference);
        } catch {
          response.status(422).json(errorBody('SOURCE_UNRESOLVED', 'A source reference could not be resolved.', response.locals.requestId));
          return;
        }
      }
      evidenceLabels[claim.id] = classifyEvidence({
        authorised: true,
        provenanceValid: true,
        conflict: false,
        missingContext: false,
        reviewedIndependentOrigins: 0
      }) ?? 'RECORDED_CLAIM';
    }
    response.json({
      patient: { id: patient.id, displayName: patient.display_name, alternateName: patient.alternate_name },
      claims,
      evidenceLabels,
      mode: 'synthetic_fixture'
    });
  });

  app.get('/api/patients/:pid/prescriptions', authenticate, (request, response: Response<unknown, Locals>) => {
    const patientId = routeParam(request.params.pid);
    if (!patientId || !requirePatientAccess(response, patientId)) return;
    const asOfCandidate = typeof request.query.asOf === 'string' ? request.query.asOf : clock().toISOString();
    const parsedAsOf = InstantSchema.safeParse(asOfCandidate);
    if (!parsedAsOf.success) {
      response.status(400).json(errorBody('INVALID_INPUT', 'asOf must be an ISO 8601 timestamp with an offset.', response.locals.requestId));
      return;
    }
    const prescriptions = repository.getMedications(patientId)
      .map(({ record, events }) => derivePrescriptionView(record, events, parsedAsOf.data));
    response.json({ prescriptions, mode: 'synthetic_fixture' });
  });

  app.get('/api/documents/:id/preview', authenticate, (request, response: Response<unknown, Locals>) => {
    const documentId = routeParam(request.params.id);
    const document = documentId ? repository.getDocument(documentId) : undefined;
    if (!document || !requirePatientAccess(response, document.patient_id)) {
      if (!response.headersSent) response.status(404).json(errorBody('FORBIDDEN', 'The requested resource is unavailable.', response.locals.requestId));
      return;
    }
    response.json({
      document: { id: document.id, version: document.version, title: document.title, content: document.content, sha256: document.sha256 },
      mode: 'synthetic_fixture'
    });
  });

  app.use((_request, response: Response<unknown, Locals>) => {
    response.status(404).json(errorBody('FORBIDDEN', 'The requested resource is unavailable.', response.locals.requestId));
  });

  app.use((error: unknown, _request: Request, response: Response<unknown, Locals>, _next: NextFunction) => {
    console.error('Request failed', { requestId: response.locals.requestId, error: error instanceof Error ? error.message : 'unknown' });
    response.status(500).json(errorBody('CONFLICT', 'The request could not be completed.', response.locals.requestId));
  });

  return app;
}

