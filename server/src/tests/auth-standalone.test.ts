import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
const mocks = vi.hoisted(() => ({
  rotate: vi.fn(),
  findSession: vi.fn(),
  revokeFamily: vi.fn(),
  revokeSession: vi.fn(),
  findUser: vi.fn(),
}));
vi.mock('../models/index.js', () => ({
  Session: {
    findOneAndUpdate: mocks.rotate,
    findOne: mocks.findSession,
    updateMany: mocks.revokeFamily,
    updateOne: mocks.revokeSession,
  },
  User: { findById: () => ({ select: mocks.findUser }) },
}));
import { refresh, hashToken } from '../services/auth.js';
describe('Standalone-compatible session rotation', () => {
  beforeEach(() => vi.resetAllMocks());
  it('rotates the token on the existing session and preserves its absolute expiry', async () => {
    const expiry = new Date(Date.now() + 60000);
    mocks.rotate.mockResolvedValue({ _id: 'session-1', user: 'user-1', expiresAt: expiry });
    mocks.findUser.mockResolvedValue({
      _id: 'user-1',
      name: 'Test',
      email: 'test@example.test',
      role: 'STAFF',
      isActive: true,
      tokenVersion: 0,
    });
    const cookie = vi.fn();
    const res = { cookie } as unknown as Response;
    await refresh('old-token', res);
    const refreshCookie = cookie.mock.calls.find((c) => c[0] === 'refresh')!;
    expect(refreshCookie[1]).not.toBe('old-token');
    expect(refreshCookie[2].maxAge).toBeGreaterThan(0);
    expect(refreshCookie[2].maxAge).toBeLessThanOrEqual(60000);
    const [filter, update] = mocks.rotate.mock.calls[0];
    expect(filter.tokenHash).toBe(hashToken('old-token'));
    expect(update.$set.tokenHash).toBe(hashToken(refreshCookie[1]));
    expect(update.$push.usedTokenHashes).toBe(hashToken('old-token'));
    const access = cookie.mock.calls.find((c) => c[0] === 'access')![1];
    expect(jwt.decode(access)).toMatchObject({ sid: 'session-1', sub: 'user-1' });
  });
  it('revokes the family on replay without issuing cookies', async () => {
    mocks.rotate.mockResolvedValue(null);
    mocks.findSession.mockResolvedValue({ family: 'family-1' });
    const cookie = vi.fn();
    await expect(refresh('used-token', { cookie } as unknown as Response)).rejects.toMatchObject({
      status: 401,
    });
    expect(mocks.revokeFamily).toHaveBeenCalledWith(
      { family: 'family-1' },
      expect.objectContaining({ $set: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
    expect(cookie).not.toHaveBeenCalled();
  });
  it('rejects inactive users and revokes their session', async () => {
    mocks.rotate.mockResolvedValue({ _id: 'session-1', user: 'user-1' });
    mocks.findUser.mockResolvedValue({ isActive: false });
    const cookie = vi.fn();
    await expect(refresh('token', { cookie } as unknown as Response)).rejects.toMatchObject({
      status: 401,
    });
    expect(mocks.revokeSession).toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
  });
});
