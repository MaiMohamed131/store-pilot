import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const temp = fileURLToPath(new URL('../.cache/test-tmp', import.meta.url));
mkdirSync(temp, { recursive: true });
Object.assign(process.env, { TEMP: temp, TMP: temp, TMPDIR: temp });
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./src/tests/setup.ts'], restoreMocks: true },
});
