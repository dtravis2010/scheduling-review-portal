import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Unit and screen tests. Emulator tests (security rules, Firestore store) live
// in tests/emulator and run with `npm run test:emulator`.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.spec.{js,jsx}'],
    environment: 'jsdom',
    setupFiles: ['src/editing/test/setup.js'],
  },
})
