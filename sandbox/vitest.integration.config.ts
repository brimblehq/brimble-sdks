import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 240_000,
    hookTimeout: 240_000,
    restoreMocks: true,
    clearMocks: true,
    sequence: {
      concurrent: false,
    },
  },
});
