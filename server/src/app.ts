import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { ZodError } from 'zod';
import { isAllowedOrigin } from './config/origins.js';
import {
  AppError,
  admin,
  authenticate,
  csrf,
  csrfToken,
  cookieOptions,
  publicUser,
} from './middleware/security.js';
import { User, Product, Order, Session, Shop } from './models/index.js';
import * as v from './validators/index.js';
import { login, refresh, hashToken } from './services/auth.js';
import { changeStatus } from './services/orders.js';
import { analytics } from './services/analytics.js';
import { listProducts, listOrders, listUsers } from './services/catalog.js';
import { updateTeamMember, changePassword } from './services/users.js';
export const app = express();
app.disable('x-powered-by');
app.use(
  helmet(),
  cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  }),
  express.json({ limit: '100kb' }),
  cookieParser(),
);
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.get('/api/v1/health', (_req, res) =>
  res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({
    data: { status: mongoose.connection.readyState === 1 ? 'ready' : 'database unavailable' },
  }),
);
const api = express.Router();
app.use('/api/v1', api);
api.get('/auth/csrf', csrfToken);
api.use(csrf);
api.post(
  '/auth/login',
  rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message: 'Too many attempts. Try again in 15 minutes.' } },
  }),
  async (req, res) => {
    const input = v.loginInput.parse(req.body);
    res.json({ data: await login(input.email, input.password, res) });
  },
);
api.post(
  '/auth/refresh',
  rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }),
  async (req, res) => res.json({ data: await refresh(req.cookies.refresh, res) }),
);
api.post('/auth/logout', async (req, res) => {
  if (req.cookies.refresh) {
    const session = await Session.findOne({ tokenHash: hashToken(req.cookies.refresh) });
    if (session)
      await Session.updateMany({ family: session.family }, { $set: { revokedAt: new Date() } });
  }
  res.clearCookie('access', cookieOptions).clearCookie('refresh', cookieOptions).status(204).end();
});
api.use(authenticate);
api.get('/auth/me', (req, res) => res.json({ data: req.actor }));
const id = (value: unknown) => {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value))
    throw new AppError(400, 'Invalid record ID.');
  return value;
};
const found = (record: any, label: string) => {
  if (!record) throw new AppError(404, `${label} not found.`);
  return record;
};
api.get('/products', async (req, res) => res.json(await listProducts(req.query)));
api.get('/products/:id', async (req, res) =>
  res.json({ data: found(await Product.findById(id(req.params.id)).lean(), 'Product') }),
);
api.post('/products', admin, async (req, res) =>
  res.status(201).json({ data: await Product.create(v.productInput.parse(req.body)) }),
);
api.patch('/products/:id', admin, async (req, res) =>
  res.json({
    data: found(
      await Product.findByIdAndUpdate(
        id(req.params.id),
        { $set: v.productInput.partial().parse(req.body) },
        { new: true, runValidators: true },
      ),
      'Product',
    ),
  }),
);
api.delete('/products/:id', admin, async (req, res) => {
  found(
    await Product.findByIdAndUpdate(id(req.params.id), { $set: { isActive: false } }),
    'Product',
  );
  res.status(204).end();
});
api.get('/orders', async (req, res) => res.json(await listOrders(req.query)));
api.get('/orders/:id', async (req, res) =>
  res.json({
    data: found(
      await Order.findById(id(req.params.id)).populate('history.actor', 'name').lean(),
      'Order',
    ),
  }),
);
api.patch('/orders/:id/status', async (req, res) =>
  res.json({
    data: await changeStatus(id(req.params.id), v.statusInput.parse(req.body).status, req.actor),
  }),
);
api.get('/analytics/overview', async (req, res) =>
  res.json({ data: await analytics(v.rangeInput.parse(req.query)) }),
);
api.get('/analytics/:section', admin, async (req, res) => {
  const section = String(req.params.section);
  if (!['revenue', 'orders', 'top-products'].includes(section))
    throw new AppError(404, 'Endpoint not found.');
  const data = await analytics(v.rangeInput.parse(req.query));
  res.json({
    data:
      section === 'top-products'
        ? data.topProducts
        : section === 'revenue'
          ? { series: data.series, categories: data.categories }
          : { series: data.series, statuses: data.statuses },
  });
});
api.get('/users', admin, async (req, res) => res.json(await listUsers(req.query)));
api.post('/users', admin, async (req, res) => {
  const { password, ...input } = v.userInput.parse(req.body);
  const user = await User.create({ ...input, passwordHash: await argon2.hash(password) });
  res.status(201).json({ data: publicUser(user) });
});
api.patch('/users/:id', admin, async (req, res) =>
  res.json({
    data: publicUser(
      await updateTeamMember(id(req.params.id), req.actor.id, v.userPatch.parse(req.body)),
    ),
  }),
);
api.get('/settings', async (req, res) =>
  res.json({
    data: (await Shop.findOne({ key: 'main' }).lean()) ?? {
      name: 'StorePilot',
      currency: 'USD',
      email: '',
      address: '',
    },
  }),
);
api.patch('/settings', admin, async (req, res) =>
  res.json({
    data: await Shop.findOneAndUpdate(
      { key: 'main' },
      { $set: v.shopInput.parse(req.body) },
      { upsert: true, new: true, runValidators: true },
    ),
  }),
);
api.patch('/profile', async (req, res) =>
  res.json({
    data: publicUser(
      await User.findByIdAndUpdate(
        req.actor.id,
        { $set: v.profileInput.parse(req.body) },
        { new: true, runValidators: true },
      ),
    ),
  }),
);
api.post('/profile/password', async (req, res) => {
  const input = v.passwordInput.parse(req.body);
  await changePassword(req.actor.id, input.currentPassword, input.password);
  res.clearCookie('access', cookieOptions).clearCookie('refresh', cookieOptions).status(204).end();
});
app.use((_req, _res) => {
  throw new AppError(404, 'Endpoint not found.');
});
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError)
    return res.status(400).json({
      error: {
        message: 'Please check the submitted fields.',
        fields: error.flatten().fieldErrors,
      },
    });
  if (error?.code === 11000)
    return res
      .status(409)
      .json({ error: { message: 'A record with this email or SKU already exists.' } });
  if (error instanceof AppError)
    return res
      .status(error.status)
      .json({ error: { message: error.message, ...(error.code ? { code: error.code } : {}) } });
  if (error?.type === 'entity.parse.failed')
    return res.status(400).json({ error: { message: 'Invalid JSON body.' } });
  console.error(error);
  res.status(500).json({ error: { message: 'An unexpected error occurred. Please try again.' } });
});
