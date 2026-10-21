// Exercises CSRF and login validation only: empty login bodies never reach database/auth work.
const base = 'http://localhost:5173/api/v1';
const csrf = await fetch(`${base}/auth/csrf`);
if (csrf.status !== 200) throw new Error(`CSRF bootstrap returned ${csrf.status}`);
const token = (await csrf.json()).data.token;
const cookies = csrf.headers
  .getSetCookie()
  .map((cookie) => cookie.split(';')[0])
  .join('; ');
const results = [];
for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { origin, cookie: cookies, 'x-csrf-token': token, 'content-type': 'application/json' },
    body: '{}',
  });
  if (response.status !== 400)
    throw new Error(
      `Expected input validation (400) after CSRF for ${origin}, got ${response.status}: ${await response.text()}`,
    );
  results.push({
    origin,
    status: response.status,
    result: 'CSRF accepted; empty login rejected before database access',
  });
}
const denied = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: {
    origin: 'https://attacker.test',
    cookie: cookies,
    'x-csrf-token': token,
    'content-type': 'application/json',
  },
  body: '{}',
});
if (denied.status !== 403 || (await denied.json()).error.code !== 'CSRF_ORIGIN')
  throw new Error('Foreign origin was not rejected correctly.');
const stale = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: {
    origin: 'http://localhost:5173',
    cookie: cookies,
    'x-csrf-token': '0'.repeat(64),
    'content-type': 'application/json',
  },
  body: '{}',
});
if (stale.status !== 403 || (await stale.json()).error.code !== 'CSRF_INVALID')
  throw new Error('Stale token was not rejected correctly.');
console.log(
  JSON.stringify(
    {
      validOrigins: results,
      foreignOrigin: 'blocked',
      staleToken: 'blocked with recoverable code',
      databaseWrites: 'none',
    },
    null,
    2,
  ),
);
