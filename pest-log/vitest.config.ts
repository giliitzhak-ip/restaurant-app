import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['tests/setup/unit.setup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'pdf',
          include: ['tests/pdf/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup/chromium.setup.ts'],
          testTimeout: 180_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/setup/pg.globalSetup.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'rls',
          include: ['tests/rls/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/setup/pg.globalSetup.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
