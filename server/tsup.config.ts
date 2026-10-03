import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  external: ['node:crypto', 'node:fs', 'node:path', 'node:sqlite', 'node:url'],
  noExternal: ['@pran-rekha/contracts', '@pran-rekha/domain']
});
