import { resolve } from 'node:path';

export const DEMO_DATABASE_RELATIVE_PATH = '.data/pran-rekha-demo.sqlite';
export const DEMO_MARKER_RELATIVE_PATH = '.data/.pran-rekha-demo-workspace';
export const DEMO_MARKER_CONTENT = 'pran-rekha-synthetic-demo-v1';

export function resolveDemoDatabasePath(workspaceRoot: string, candidate = DEMO_DATABASE_RELATIVE_PATH): string {
  const allowed = resolve(workspaceRoot, DEMO_DATABASE_RELATIVE_PATH);
  const resolved = resolve(workspaceRoot, candidate);
  if (resolved !== allowed) throw new Error(`Refusing to reset anything except ${allowed}.`);
  return resolved;
}

