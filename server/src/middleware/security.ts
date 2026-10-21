import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { isAllowedOrigin } from '../config/origins.js';
import { User, Session } from '../models/index.js';
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export type Actor = { id: string; role: 'ADMIN' | 'STAFF'; name: string; email: string };
// Express request augmentation is intentionally an ambient namespace.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor: Actor;
    }
  }
}
export const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1',
};
export const publicUser = (user: any) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
});
export function csrfToken(req: Request, res: Response) {
  const existing = req.cookies.csrf;
  const token =
    typeof existing === 'string' && /^[a-f0-9]{64}$/.test(existing)
      ? existing
      : randomBytes(32).toString('hex');
  res.cookie('csrf', token, { ...cookieOptions, httpOnly: false });
  res.json({ data: { token } });
}
export function csrf(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!isAllowedOrigin(origin))
    throw new AppError(
      403,
      `This browser origin is not allowed. Open ${new URL(env.CLIENT_ORIGIN).origin} and try again.`,
      'CSRF_ORIGIN',
    );
  const a = req.cookies.csrf;
  const b = req.get('x-csrf-token');
  if (
    typeof a !== 'string' ||
    typeof b !== 'string' ||
    !/^[a-f0-9]{64}$/.test(a) ||
    !/^[a-f0-9]{64}$/.test(b) ||
    !timingSafeEqual(Buffer.from(a), Buffer.from(b))
  )
    throw new AppError(403, 'Invalid CSRF token. Refresh the page and try again.', 'CSRF_INVALID');
  next();
}
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(req.cookies.access, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'storepilot',
      audience: 'storepilot-web',
    }) as jwt.JwtPayload;
  } catch {
    throw new AppError(401, 'Please sign in to continue.');
  }
  const [user, session] = await Promise.all([
    User.findById(payload.sub).select('+tokenVersion'),
    Session.findOne({
      _id: payload.sid,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    }),
  ]);
  if (
    !user?.isActive ||
    !session ||
    String(session.user) !== String(user._id) ||
    user.tokenVersion !== payload.version
  )
    throw new AppError(401, 'Your session has expired.');
  req.actor = {
    id: String(user._id),
    role: user.role as Actor['role'],
    name: user.name,
    email: user.email,
  };
  next();
}
export function admin(req: Request, _res: Response, next: NextFunction) {
  if (req.actor.role !== 'ADMIN') throw new AppError(403, 'Administrator access is required.');
  next();
}
