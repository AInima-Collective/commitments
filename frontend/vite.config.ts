import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow Vite to read the repository docs directory (one level above the
    // frontend package). The docs loader uses `import.meta.glob` against it.
    fs: {
      allow: [repoRoot],
    },
  },
  resolve: {
    alias: {
      '@docs-root': `${repoRoot}/docs`,
    },
  },
})
