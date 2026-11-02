import { Router } from 'express';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError, cookieOptions } from '../middleware/security.js';
import { buildDemoData } from '../services/demo-data.js';
import { dateRange } from '../services/analytics.js';
import { allowedTransitions } from '../services/orders.js';
import * as v from '../validators/index.js';

type Product = Omit<ReturnType<typeof buildDemoData>['products'][number], '_id'> & { _id: string };
type Order = Omit<ReturnType<typeof buildDemoData>['orders'][number], '_id' | 'history'> & {
  _id: string;
  history: { from: string; to: string; actor: { name: string }; at: Date }[];
};
type Person = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
  isActive: boolean;
  passwordHash: string;
  createdAt: string;
};
type Workspace = {
  expires: number;
  products: Product[];
  orders: Order[];
  users: Person[];
  actorId: string;
  shop: { name: string; email: string; currency: string; address: string };
};
const lifetime = 24 * 60 * 60 * 1000;
const workspaces = new Map<string, Workspace>();
const passwordHash = (password: string) => {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 32).toString('hex');
};
const initialHash = passwordHash('DemoPassword123!');
const matchesPassword = (password: string, hash: string) => {
  const [salt, key] = hash.split(':');
  return timingSafeEqual(scryptSync(password, salt, 32), Buffer.from(key, 'hex'));
};
const publicPerson = (p: Person) => ({
  id: p.id,
  name: p.name,
  email: p.email,
  role: p.role,
  isActive: p.isActive,
  createdAt: p.createdAt,
});
function createWorkspace(): Workspace {
  const data = JSON.parse(JSON.stringify(buildDemoData(new Date())));
  const id = new mongoose.Types.ObjectId().toString();
  return {
    expires: Date.now() + lifetime,
    ...data,
    actorId: id,
    users: [
      {
        id,
        name: 'Portfolio Visitor',
        email: 'visitor@example.test',
        role: 'ADMIN',
        isActive: true,
        passwordHash: initialHash,
        createdAt: new Date().toISOString(),
      },
      {
        id: new mongoose.Types.ObjectId().toString(),
        name: 'Alex Chen',
        email: 'alex@example.test',
        role: 'STAFF',
        isActive: true,
        passwordHash: initialHash,
        createdAt: new Date().toISOString(),
      },
    ],
    shop: {
      name: 'The Everyday Store',
      email: 'hello@example.test',
      currency: 'USD',
      address: '24 Market Street',
    },
  };
}
export const demoRouter = Router();
const creationLimit = rateLimit({
  windowMs: 60000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
const mutationLimit = rateLimit({
  windowMs: 60000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
demoRouter.use((req, res, next) => {
  if (!env.DEMO_MODE) return next('router');
  for (const [key, value] of workspaces) if (value.expires <= Date.now()) workspaces.delete(key);
  const token = req.cookies.demo;
  let workspace = typeof token === 'string' ? workspaces.get(token) : undefined;
  const ready = () => {
    res.locals.demo = workspace;
    next();
  };
  if (!workspace)
    return creationLimit(req, res, () => {
      if (workspaces.size >= 200)
        throw new AppError(503, 'The demo is busy. Please try again later.');
      workspace = createWorkspace();
      const key = randomBytes(32).toString('hex');
      workspaces.set(key, workspace);
      res.cookie('demo', key, { ...cookieOptions, maxAge: lifetime });
      ready();
    });
  ready();
});
demoRouter.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return mutationLimit(req, res, next);
});
demoRouter.use((req, res, next) => {
  const w: Workspace = res.locals.demo;
  const actor = w.users.find((u) => u.id === w.actorId)!;
  res.locals.actor = actor;
  if (
    !['/auth/me', '/auth/refresh', '/auth/login', '/auth/logout', '/demo/reset'].includes(req.path)
  ) {
    if (!actor.isActive)
      throw new AppError(403, 'Your demo account is inactive. Reset the demo to start over.');
    if (
      (req.path.startsWith('/users') ||
        req.path.startsWith('/analytics/') ||
        (req.path.startsWith('/products') && req.method !== 'GET') ||
        (req.path === '/settings' && req.method !== 'GET')) &&
      actor.role !== 'ADMIN'
    )
      throw new AppError(403, 'Administrator access is required.');
  }
  next();
});
demoRouter.get('/auth/me', (_req, res) =>
  res.json({ data: { ...publicPerson(res.locals.actor), isDemo: true } }),
);
demoRouter.post('/auth/refresh', (_req, res) =>
  res.json({ data: { ...publicPerson(res.locals.actor), isDemo: true } }),
);
demoRouter.post('/auth/login', (req, res) => {
  const input = v.loginInput.parse(req.body);
  const w: Workspace = res.locals.demo;
  const user = w.users.find((u) => u.email === input.email && u.isActive);
  if (!user || !matchesPassword(input.password, user.passwordHash))
    throw new AppError(401, 'Invalid email or password.');
  w.actorId = user.id;
  res.json({ data: { ...publicPerson(user), isDemo: true } });
});
demoRouter.post('/auth/logout', (_req, res) => res.status(204).end());
demoRouter.post('/demo/reset', (_req, res) => {
  const w: Workspace = res.locals.demo;
  Object.assign(w, createWorkspace());
  res.json({ data: { ...publicPerson(w.users[0]), isDemo: true } });
});
function record<T extends { _id: string }>(rows: T[], id: unknown, label: string): T {
  const row = rows.find((r) => r._id === id);
  if (!row) throw new AppError(404, label + ' not found.');
  return row;
}
function unique(
  rows: { sku?: string; email?: string; id?: string; _id?: string }[],
  field: 'sku' | 'email',
  value: string,
  id?: string,
) {
  if (rows.some((r) => r[field] === value && (r.id ?? r._id) !== id))
    throw new AppError(409, 'This ' + field + ' is already in use.');
}
demoRouter.get(['/products', '/orders', '/users'], (req, res) => {
  const w: Workspace = res.locals.demo;
  const q = v.listInput.parse(req.query);
  const kind = req.path.slice(1) as 'products' | 'orders' | 'users';
  let rows: Record<string, any>[] = kind === 'users' ? w.users.map(publicPerson) : [...w[kind]];
  const search = q.search.toLowerCase();
  if (search)
    rows = rows.filter((r) =>
      (kind === 'products'
        ? [r.name, r.sku]
        : kind === 'orders'
          ? [r.orderNumber, r.customerName, r.customerEmail]
          : [r.name, r.email]
      ).some((value) => value.toLowerCase().includes(search)),
    );
  if (kind === 'products') {
    if (q.active !== 'all') rows = rows.filter((r) => r.isActive === (q.active === 'true'));
    if (q.category) rows = rows.filter((r) => r.category === q.category);
    if (q.stock)
      rows = rows.filter((r) =>
        q.stock === 'out'
          ? r.stockQuantity === 0
          : q.stock === 'low'
            ? r.stockQuantity > 0 && r.stockQuantity <= r.lowStockThreshold
            : r.stockQuantity > r.lowStockThreshold,
      );
  }
  if (kind === 'orders') {
    if (q.status) rows = rows.filter((r) => r.orderStatus === q.status);
    if (q.from || q.to) {
      const { start, end } = dateRange(q);
      rows = rows.filter((r) => new Date(r.createdAt) >= start && new Date(r.createdAt) <= end);
    }
  }
  const sort = (kind === 'products'
    ? ['name', 'price', 'createdAt', 'stockQuantity']
    : kind === 'orders'
      ? ['createdAt', 'totalAmount']
      : ['createdAt']
  ).includes(q.sort)
    ? q.sort
    : 'createdAt';
  rows.sort(
    (a, b) =>
      (a[sort] > b[sort]
        ? 1
        : a[sort] < b[sort]
          ? -1
          : String(a._id ?? a.id).localeCompare(String(b._id ?? b.id))) *
      (q.direction === 'asc' ? 1 : -1),
  );
  res.json({
    data: rows.slice((q.page - 1) * q.limit, q.page * q.limit),
    meta: {
      total: rows.length,
      page: q.page,
      limit: q.limit,
      ...(kind === 'products'
        ? { categories: [...new Set(w.products.map((p) => p.category))] }
        : {}),
    },
  });
});
demoRouter.get('/products/:id', (req, res) =>
  res.json({ data: record(res.locals.demo.products, req.params.id, 'Product') }),
);
demoRouter.post('/products', (req, res) => {
  const w: Workspace = res.locals.demo;
  const input = v.productInput.parse(req.body);
  unique(w.products, 'sku', input.sku);
  if (w.products.length >= 500) throw new AppError(409, 'Reset the demo to add more products.');
  const product = {
    ...input,
    _id: new mongoose.Types.ObjectId().toString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  w.products.push(product as unknown as Product);
  res.status(201).json({ data: product });
});
demoRouter.patch('/products/:id', (req, res) => {
  const w: Workspace = res.locals.demo;
  const p = record(w.products, req.params.id, 'Product');
  const input = v.productInput.partial().parse(req.body);
  if (input.sku) unique(w.products, 'sku', input.sku, p._id);
  Object.assign(p, input, { updatedAt: new Date().toISOString() });
  res.json({ data: p });
});
demoRouter.delete('/products/:id', (req, res) => {
  record<Product>(res.locals.demo.products, req.params.id, 'Product').isActive = false;
  res.status(204).end();
});
demoRouter.get('/orders/:id', (req, res) =>
  res.json({ data: record(res.locals.demo.orders, req.params.id, 'Order') }),
);
demoRouter.patch('/orders/:id/status', (req, res) => {
  const w: Workspace = res.locals.demo;
  const o = record(w.orders, req.params.id, 'Order');
  const { status } = v.statusInput.parse(req.body);
  if (!allowedTransitions(o.orderStatus, res.locals.actor.role).includes(status))
    throw new AppError(409, 'This order status transition is not permitted.');
  o.history.push({
    from: o.orderStatus,
    to: status,
    actor: { name: res.locals.actor.name },
    at: new Date(),
  });
  o.orderStatus = status;
  if (status === 'Cancelled') {
    for (const item of o.items)
      record(w.products, String(item.product), 'Product').stockQuantity += item.quantity;
    if (o.paymentStatus === 'Paid') o.paymentStatus = 'Refunded';
  }
  res.json({ data: o });
});
demoRouter.post('/users', (req, res) => {
  const w: Workspace = res.locals.demo;
  const { password, ...input } = v.userInput.parse(req.body);
  unique(w.users, 'email', input.email);
  if (w.users.length >= 50) throw new AppError(409, 'Reset the demo to add more team members.');
  const user = {
    ...input,
    id: new mongoose.Types.ObjectId().toString(),
    isActive: true,
    passwordHash: passwordHash(password),
    createdAt: new Date().toISOString(),
  };
  w.users.push(user);
  res.status(201).json({ data: publicPerson(user) });
});
demoRouter.patch('/users/:id', (req, res) => {
  const w: Workspace = res.locals.demo;
  const user = w.users.find((u) => u.id === req.params.id);
  if (!user) throw new AppError(404, 'User not found.');
  const input = v.userPatch.parse(req.body);
  if (input.email) unique(w.users, 'email', input.email, user.id);
  if (
    user.role === 'ADMIN' &&
    user.isActive &&
    (input.role === 'STAFF' || input.isActive === false) &&
    w.users.filter((u) => u.role === 'ADMIN' && u.isActive).length <= 1
  )
    throw new AppError(409, 'Keep at least one active administrator.');
  Object.assign(user, input);
  res.json({ data: publicPerson(user) });
});
demoRouter.get('/settings', (_req, res) => res.json({ data: res.locals.demo.shop }));
demoRouter.patch('/settings', (req, res) => {
  Object.assign(res.locals.demo.shop, v.shopInput.parse(req.body));
  res.json({ data: res.locals.demo.shop });
});
demoRouter.patch('/profile', (req, res) => {
  const input = v.profileInput.parse(req.body);
  unique(res.locals.demo.users, 'email', input.email, res.locals.actor.id);
  Object.assign(res.locals.actor, input);
  res.json({ data: publicPerson(res.locals.actor) });
});
demoRouter.post('/profile/password', (req, res) => {
  const input = v.passwordInput.parse(req.body);
  if (!matchesPassword(input.currentPassword, res.locals.actor.passwordHash))
    throw new AppError(400, 'Current password is incorrect.');
  res.locals.actor.passwordHash = passwordHash(input.password);
  res.status(204).end();
});
demoRouter.get('/analytics/:section', (req, res) => {
  if (!['overview', 'revenue', 'orders', 'top-products'].includes(String(req.params.section)))
    throw new AppError(404, 'Endpoint not found.');
  const w: Workspace = res.locals.demo;
  const q = v.rangeInput.parse(req.query);
  const { start, end } = dateRange(q);
  const orders = w.orders.filter(
    (o) => new Date(o.createdAt) >= start && new Date(o.createdAt) <= end,
  );
  const paid = orders.filter((o) => o.paymentStatus === 'Paid' && o.orderStatus !== 'Cancelled');
  const revenue = paid.reduce((n, o) => n + o.totalAmount, 0);
  const bucket = (value: Date) => {
    const d = new Date(value);
    d.setUTCHours(0, 0, 0, 0);
    if (q.group === 'monthly') d.setUTCDate(1);
    if (q.group === 'weekly') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString();
  };
  const series = [];
  for (let d = new Date(bucket(start)); d <= end;) {
    const key = d.toISOString();
    series.push({
      date: key,
      revenue: paid
        .filter((o) => bucket(new Date(o.createdAt)) === key)
        .reduce((n, o) => n + o.totalAmount, 0),
      orders: orders.filter((o) => bucket(new Date(o.createdAt)) === key).length,
    });
    d = new Date(d);
    if (q.group === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCDate(d.getUTCDate() + (q.group === 'weekly' ? 7 : 1));
  }
  const products = new Map<
    string,
    { _id: string; name: string; sku: string; units: number; revenue: number }
  >();
  const categories = new Map<string, number>();
  for (const o of paid)
    for (const item of o.items) {
      const key = String(item.product);
      const p = products.get(key) ?? {
        _id: key,
        name: item.name,
        sku: item.sku,
        units: 0,
        revenue: 0,
      };
      p.units += item.quantity;
      p.revenue += item.lineTotal;
      products.set(key, p);
      categories.set(item.category, (categories.get(item.category) ?? 0) + item.lineTotal);
    }
  const result = {
    range: { from: start, to: end, group: q.group },
    metrics: {
      revenue,
      orders: orders.length,
      products: w.products.filter((p) => p.isActive).length,
      paidOrders: paid.length,
      averageOrderValue: paid.length ? Math.round(revenue / paid.length) : 0,
    },
    series,
    statuses: [...new Set(orders.map((o) => o.orderStatus))].map((status) => ({
      _id: status,
      count: orders.filter((o) => o.orderStatus === status).length,
    })),
    topProducts: [...products.values()].sort((a, b) => b.units - a.units).slice(0, 5),
    categories: [...categories]
      .map(([_id, revenue]) => ({ _id, revenue }))
      .sort((a, b) => b.revenue - a.revenue),
    lowStock: w.products
      .filter((p) => p.isActive && p.stockQuantity <= p.lowStockThreshold)
      .sort((a, b) => a.stockQuantity - b.stockQuantity)
      .slice(0, 5),
    recentOrders: [...orders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5),
  };
  res.json({
    data:
      req.params.section === 'overview'
        ? result
        : req.params.section === 'top-products'
          ? result.topProducts
          : req.params.section === 'revenue'
            ? { series, categories: result.categories }
            : { series, statuses: result.statuses },
  });
});
// Demo requests must never fall through to the real database routes.
demoRouter.use(() => {
  throw new AppError(404, 'Endpoint not found.');
});
