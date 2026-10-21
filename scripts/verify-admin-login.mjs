// Verifies only the configured admin. Never prints credentials, hashes, or session tokens.
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../server/.env', import.meta.url)), quiet: true });
const base = 'http://localhost:5173/api/v1';
const jar = new Map();
function remember(response) {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0];
    const at = pair.indexOf('=');
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
}
const cookies = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
const bootstrap = await fetch(`${base}/auth/csrf`);
remember(bootstrap);
if (bootstrap.status !== 200) throw new Error('CSRF bootstrap failed.');
const token = (await bootstrap.json()).data.token;
const login = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: {
    origin: 'http://localhost:5173',
    cookie: cookies(),
    'x-csrf-token': token,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_PASSWORD,
  }),
});
remember(login);
if (login.status !== 200) throw new Error(`Login failed with HTTP ${login.status}.`);
try {
  const signedIn = (await login.json()).data;
  if (
    signedIn.role !== 'ADMIN' ||
    signedIn.email !== process.env.SEED_ADMIN_EMAIL.toLowerCase() ||
    signedIn.passwordHash !== undefined
  )
    throw new Error('Unexpected login response.');
  const current = await fetch(`${base}/auth/me`, { headers: { cookie: cookies() } });
  if (current.status !== 200 || (await current.json()).data.id !== signedIn.id)
    throw new Error('Authenticated session verification failed.');
  const users = await fetch(`${base}/users`, { headers: { cookie: cookies() } });
  if (users.status !== 200) throw new Error('Admin authorization verification failed.');
  const list = await users.json();
  console.log(
    JSON.stringify(
      {
        loginStatus: login.status,
        authenticatedUserStatus: current.status,
        adminEndpointStatus: users.status,
        role: signedIn.role,
        userCount: list.meta.total,
        passwordHashExposed: false,
      },
      null,
      2,
    ),
  );
} finally {
  // Revoke only this newly created verification session, leaving all other sessions alone.
  const logout = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: { origin: 'http://localhost:5173', cookie: cookies(), 'x-csrf-token': token },
  });
  if (logout.status !== 204) {
    console.error('Verification-session logout failed.');
    process.exitCode = 1;
  } else console.log('Only the verification session was signed out.');
}
