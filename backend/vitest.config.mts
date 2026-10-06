import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Cold starts (TS transform, PGlite boot) can exceed the 5s default on CI
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
