// Connect-only runner. MongoDB lifecycle and existing data belong to the user.
import dotenv from 'dotenv';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
dotenv.config({ path: ['server/.env', '.env'], quiet: true });
const root = fileURLToPath(new URL('../../../', import.meta.url));
const temp = `${root}/.cache/local-tmp`;
mkdirSync(temp, { recursive: true });
Object.assign(process.env, {
  TEMP: temp,
  TMP: temp,
  TMPDIR: temp,
  MONGOMS_RUNTIME_DOWNLOAD: 'false',
  MONGOMS_DOWNLOAD_DIR: `${root}/.cache/mongodb`,
});
const { env } = await import('../config/env.js');
const { app } = await import('../app.js');
// Disable implicit collection/index creation: startup must not write to an existing database.
try {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    autoCreate: false,
    autoIndex: false,
  });
} catch {
  console.error(
    'Cannot connect to MONGODB_URI. Start your existing MongoDB server manually, then retry. StorePilot does not start or configure MongoDB.',
  );
  await mongoose.disconnect();
  process.exit(1);
}
const { supportsTransactions } = await import('../services/database.js');
const transactions = await supportsTransactions();
console.log(
  `Connected to existing MongoDB (${transactions ? 'transactions available' : 'standalone; transaction-dependent actions are unavailable'}). No seeding or database configuration performed.`,
);
const server = app.listen(env.PORT, () =>
  console.log(
    `StorePilot local API: http://localhost:${env.PORT}. Project temporary files: ${temp}.`,
  ),
);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close(() => void mongoose.disconnect().then(() => process.exit(0)));
  });
