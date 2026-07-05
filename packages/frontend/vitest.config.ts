import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Frontend tests run in jsdom (browser-like DOM, no real browser).
// heic2any and other Worker-dependent browser APIs must be mocked in tests.
export default defineProject({
  plugins: [react()],
  resolve: {
    alias: {
      '@my-app/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    name: 'frontend',
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
});
