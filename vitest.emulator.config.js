import { defineConfig } from 'vitest/config'

// Security-rules and Firestore-store tests. Needs the local emulator, so run
// them with `npm run test:emulator` (project demo-scheduling-review, offline).
export default defineConfig({
  test: {
    include: ['tests/emulator/**/*.test.js'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
  },
})
