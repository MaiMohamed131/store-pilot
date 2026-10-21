import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'development',
    CLIENT_ORIGIN: 'http://localhost:5173',
    JWT_SECRET: 'csrf-test-secret-with-at-least-32-characters',
  },
}));
import { csrf, csrfToken, AppError } from '../middleware/security.js';
import { isAllowedOrigin } from '../config/origins.js';
const app = express();
app.use(cookieParser());
app.get('/api/v1/csrf', csrfToken);
app.post('/api/v1/mutation', csrf, (_req, res) => res.json({ ok: true }));
app.use(
  (error: AppError, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.status(error.status).json({ error: { code: error.code, message: error.message } }),
);
describe('Cookie CSRF protection and local origins', () => {
  it('accepts loopback aliases only in development on the configured port', () => {
    expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    for (const origin of [
      'http://localhost:5174',
      'https://localhost:5173',
      'http://localhost.evil.test:5173',
      'http://192.168.1.10:5173',
      'null',
    ])
      expect(isAllowedOrigin(origin)).toBe(false);
  });
  it('keeps production origin matching strict', () => {
    expect(isAllowedOrigin('http://127.0.0.1:5173', 'http://localhost:5173', 'production')).toBe(
      false,
    );
    expect(isAllowedOrigin('https://store.example', 'https://store.example', 'production')).toBe(
      true,
    );
  });
  it('accepts a valid cookie/header pair from the advertised loopback alias', async () => {
    const agent = request.agent(app);
    const token = (await agent.get('/api/v1/csrf')).body.data.token;
    expect(
      (
        await agent
          .post('/api/v1/mutation')
          .set('origin', 'http://127.0.0.1:5173')
          .set('x-csrf-token', token)
      ).status,
    ).toBe(200);
  });
  it('rejects missing or stale tokens with a recoverable code', async () => {
    const agent = request.agent(app);
    await agent.get('/api/v1/csrf');
    for (const token of ['', 'a'.repeat(64)]) {
      const result = await agent.post('/api/v1/mutation').set('x-csrf-token', token);
      expect(result.status).toBe(403);
      expect(result.body.error.code).toBe('CSRF_INVALID');
    }
  });
  it('rejects foreign origins even with valid tokens, without suggesting token retry', async () => {
    const agent = request.agent(app);
    const token = (await agent.get('/api/v1/csrf')).body.data.token;
    const result = await agent
      .post('/api/v1/mutation')
      .set('origin', 'https://attacker.test')
      .set('x-csrf-token', token);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('CSRF_ORIGIN');
  });
});
