import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const target = fileURLToPath(new URL('../server/.env', import.meta.url));
try {
  await access(target);
  console.log('server/.env already exists; left unchanged.');
} catch {
  const template = await readFile(new URL('../server/.env.example', import.meta.url), 'utf8');
  const content = template
    .replace('replace-with-at-least-32-random-characters', randomBytes(48).toString('hex'))
    .replace('SEED_PASSWORD=', `SEED_PASSWORD=${randomBytes(18).toString('base64url')}`);
  await writeFile(target, content + '\nMONGOMS_RUNTIME_DOWNLOAD=false\n', { flag: 'wx' });
  console.log(
    'Created ignored server/.env. Configure MONGODB_URI for your existing server. No database connection or provisioning was performed.',
  );
}
