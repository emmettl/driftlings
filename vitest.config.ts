import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Default to Node; store tests opt into jsdom via a per-file directive.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
