import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // jsdom is needed by component tests (@testing-library/react). The
    // pre-existing pure-data tests under src/lib/** keep working because
    // jsdom is a superset of node's globals for our purposes.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
