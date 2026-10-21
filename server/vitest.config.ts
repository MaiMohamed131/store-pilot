import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const temp = fileURLToPath(new URL('../.cache/test-tmp', import.meta.url));
mkdirSync(temp, { recursive: true });
Object.assign(process.env, { TEMP: temp, TMP: temp, TMPDIR: temp });
export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 180000,
    testTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
      CLIENT_ORIGIN: 'http://localhost:5173',
      TEMP: temp,
      TMP: temp,
      TMPDIR: temp,
      MONGOMS_RUNTIME_DOWNLOAD: process.env.MONGOMS_RUNTIME_DOWNLOAD ?? 'false',
      MONGOMS_DOWNLOAD_DIR: fileURLToPath(new URL('../.cache/mongodb', import.meta.url)),
    },
  },
});
