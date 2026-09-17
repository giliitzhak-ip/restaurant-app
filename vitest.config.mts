import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Honours the `@/*` paths from tsconfig.json.
    tsconfigPaths: true,
    alias: {
      // `server-only` is a Next.js build-time guard with no Node entry point.
      'server-only': new URL('./tests/stubs/server-only.ts', import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'legacy/**'],
  },
});
