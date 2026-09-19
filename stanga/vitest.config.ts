import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure rules run in node; UI tests opt into jsdom with a file-level comment.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    restoreMocks: true,
  },
});
