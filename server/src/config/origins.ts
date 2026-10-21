import { env } from './env.js';

/** Exact production origin; only explicit loopback aliases on the same port in development. */
export function isAllowedOrigin(
  origin: string | undefined,
  configured = env.CLIENT_ORIGIN,
  mode = env.NODE_ENV,
): boolean {
  if (!origin) return true; // Non-browser clients still need the CSRF cookie/header pair.
  try {
    const expected = new URL(configured);
    const actual = new URL(origin);
    if (actual.origin !== origin) return false;
    if (origin === expected.origin) return true;
    const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
    return (
      mode === 'development' &&
      loopback.has(expected.hostname) &&
      loopback.has(actual.hostname) &&
      actual.protocol === expected.protocol &&
      actual.port === expected.port
    );
  } catch {
    return false;
  }
}
