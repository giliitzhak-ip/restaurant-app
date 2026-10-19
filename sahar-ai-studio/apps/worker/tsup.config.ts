import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // Workspace packages ship TypeScript source, so they are bundled in.
  noExternal: [/^@sahar\//],
  external: ['@prisma/client', '.prisma/client'],
});
