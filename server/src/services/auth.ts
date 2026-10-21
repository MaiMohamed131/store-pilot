import { createHash, randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { Session, User } from '../models/index.js';
import { env } from '../config/env.js';
import { AppError, cookieOptions, publicUser } from '../middleware/security.js';
export const hashToken = (s: string) => createHash('sha256').update(s).digest('hex');
function accessToken(user: any, sessionId: unknown) {
  return jwt.sign({ version: user.tokenVersion ?? 0, sid: String(sessionId) }, env.JWT_SECRET, {
    subject: String(user._id),
    expiresIn: '15m',
    algorithm: 'HS256',
    issuer: 'storepilot',
    audience: 'storepilot-web',
  });
}
async function createSession(user: any, family: string) {
  const raw = randomBytes(48).toString('hex');
  const [session] = await Session.create([
    {
      user: user._id,
      tokenHash: hashToken(raw),
      family,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  ]);
  const access = accessToken(user, session._id);
  return { access, raw };
}
function setSessionCookies(
  res: Response,
  tokens: { access: string; raw: string },
  refreshMaxAge = 7 * 86400000,
) {
  res.cookie('access', tokens.access, { ...cookieOptions, maxAge: 15 * 60000 });
  res.cookie('refresh', tokens.raw, { ...cookieOptions, maxAge: refreshMaxAge });
}
export async function issue(user: any, res: Response, family: string = randomUUID()) {
  setSessionCookies(res, await createSession(user, family));
  return publicUser(user);
}
// Precomputed only for timing equalization, never an account credential.
const dummyHash = argon2.hash(randomBytes(32).toString('hex'));
export async function login(email: string, password: string, res: Response) {
  const user = await User.findOne({ email }).select('+passwordHash +tokenVersion');
  const valid = await argon2.verify(user?.passwordHash ?? (await dummyHash), password);
  if (!user?.isActive || !valid) throw new AppError(401, 'Invalid email or password.');
  return issue(user, res);
}
export async function refresh(raw: string | undefined, res: Response) {
  if (!raw) throw new AppError(401, 'Please sign in to continue.');
  const previousHash = hashToken(raw);
  const nextRaw = randomBytes(48).toString('hex');
  // Rotation is a single-document compare-and-swap. It works on standalone MongoDB
  // and keeps all replay hashes in the same revocable session (absolute seven-day TTL).
  const session = await Session.findOneAndUpdate(
    { tokenHash: previousHash, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { tokenHash: hashToken(nextRaw) }, $push: { usedTokenHashes: previousHash } },
    { new: true },
  );
  if (!session) {
    const reused = await Session.findOne({
      $or: [{ tokenHash: previousHash }, { usedTokenHashes: previousHash }],
    });
    if (reused)
      await Session.updateMany({ family: reused.family }, { $set: { revokedAt: new Date() } });
    throw new AppError(401, 'Your session has expired.');
  }
  const user = await User.findById(session.user).select('+tokenVersion');
  if (!user?.isActive) {
    await Session.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
    throw new AppError(401, 'Your session has expired.');
  }
  setSessionCookies(
    res,
    { raw: nextRaw, access: accessToken(user, session._id) },
    Math.max(0, session.expiresAt.getTime() - Date.now()),
  );
  return publicUser(user);
}
