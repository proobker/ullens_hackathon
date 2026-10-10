import type { DatabaseSync } from 'node:sqlite';
import type { ActorRole } from '@pran-rekha/contracts';

type ActorRow = { id: string; username: string; display_name: string; role: ActorRole; password_salt: string; password_hash: string };

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
}
