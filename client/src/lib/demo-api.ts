import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from 'axios';
import seed from './demo-seed.json';
import type { Analytics, Order, Product, Shop, User, Status } from '../types';
import * as v from './demo-validation';

export const DEMO_STORAGE_KEY = 'storepilot-private-demo-v1';
type Person = User & { passwordHash: string };
type Workspace = {
  version: 1;
  expires: number;
  products: Product[];
  orders: Order[];
  users: Person[];
  actorId: string;
  shop: Shop;
};
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
const lifetime = 24 * 60 * 60 * 1000;
const transitions: Record<Status, Status[]> = {
  Pending: ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered'],
  Delivered: [],
  Cancelled: [],
};
class DemoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new DemoError(status, message);
};
const publicUser = ({ passwordHash: _password, ...user }: Person) => user;
async function hashPassword(password: string, salt: string = crypto.randomUUID()) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' },
    material,
    256,
  );
  return (
    salt + ':' + Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('')
  );
}
async function fresh(): Promise<Workspace> {
  const id = crypto.randomUUID();
  const delta = Date.now() - new Date(seed.anchor).getTime();
  const data = JSON.parse(JSON.stringify(seed), (key, value) =>
    ['createdAt', 'updatedAt', 'demoSeedDate'].includes(key)
      ? new Date(new Date(value).getTime() + delta).toISOString()
      : value,
  );
  const passwordHash = await hashPassword('DemoPassword123!');
  const createdAt = new Date().toISOString();
  return {
    version: 1,
    expires: Date.now() + lifetime,
    products: data.products,
    orders: data.orders,
    actorId: id,
    users: [
      {
        id,
        name: 'Portfolio Visitor',
        email: 'visitor@example.test',
        role: 'ADMIN',
        isActive: true,
        isDemo: true,
        passwordHash,
        createdAt,
      },
      {
        id: crypto.randomUUID(),
        name: 'Alex Chen',
        email: 'alex@example.test',
        role: 'STAFF',
        isActive: true,
        passwordHash,
        createdAt,
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
function find<T extends { _id: string }>(rows: T[], id: string, label: string) {
  return rows.find((r) => r._id === id) ?? fail(404, label + ' not found.');
}
function unique(rows: (Product | Person)[], key: 'sku' | 'email', value: string, id?: string) {
  if (
    rows.some(
      (r) =>
        (key === 'sku' && 'sku' in r ? r.sku : 'email' in r ? r.email : '') === value &&
        ('_id' in r ? r._id : r.id) !== id,
    )
  )
    fail(409, 'This ' + key + ' is already in use.');
}
function range(query: { from?: string; to?: string }) {
  const end = query.to ? new Date(query.to + 'T23:59:59.999Z') : new Date();
  const start = query.from
    ? new Date(query.from + 'T00:00:00.000Z')
    : new Date(end.getTime() - 29 * 86400000);
  if (!query.from) start.setUTCHours(0, 0, 0, 0);
  if (start > end || end.getTime() - start.getTime() > 366 * 86400000)
    fail(400, 'Choose a valid date range of at most 367 days.');
  return { start, end };
}
function analytics(w: Workspace, query: unknown): Analytics {
  const q = v.rangeInput.parse(query),
    { start, end } = range(q);
  const orders = w.orders.filter(
    (o) => new Date(o.createdAt) >= start && new Date(o.createdAt) <= end,
  );
  const paid = orders.filter((o) => o.paymentStatus === 'Paid' && o.orderStatus !== 'Cancelled');
  const revenue = paid.reduce((n, o) => n + o.totalAmount, 0);
  const bucket = (value: string | Date) => {
    const d = new Date(value);
    d.setUTCHours(0, 0, 0, 0);
    if (q.group === 'monthly') d.setUTCDate(1);
    if (q.group === 'weekly') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString();
  };
  const series: Analytics['series'] = [];
  for (let d = new Date(bucket(start)); d <= end;) {
    const key = d.toISOString();
    series.push({
      date: key,
      revenue: paid
        .filter((o) => bucket(o.createdAt) === key)
        .reduce((n, o) => n + o.totalAmount, 0),
      orders: orders.filter((o) => bucket(o.createdAt) === key).length,
    });
    d = new Date(d);
    if (q.group === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCDate(d.getUTCDate() + (q.group === 'weekly' ? 7 : 1));
  }
  const products = new Map<string, Analytics['topProducts'][number]>(),
    categories = new Map<string, number>();
  for (const order of paid)
    for (const item of order.items) {
      const p = products.get(item.product) ?? {
        _id: item.product,
        name: item.name,
        sku: item.sku,
        units: 0,
        revenue: 0,
      };
      p.units += item.quantity;
      p.revenue += item.lineTotal;
      products.set(item.product, p);
      categories.set(item.category, (categories.get(item.category) ?? 0) + item.lineTotal);
    }
  return {
    metrics: {
      revenue,
      orders: orders.length,
      products: w.products.filter((p) => p.isActive).length,
      paidOrders: paid.length,
      averageOrderValue: paid.length ? Math.round(revenue / paid.length) : 0,
    },
    series,
    statuses: [...new Set(orders.map((o) => o.orderStatus))].map((s) => ({
      _id: s,
      count: orders.filter((o) => o.orderStatus === s).length,
    })),
    topProducts: [...products.values()].sort((a, b) => b.units - a.units).slice(0, 5),
    categories: [...categories]
      .map(([_id, revenue]) => ({ _id, revenue }))
      .sort((a, b) => b.revenue - a.revenue),
    lowStock: w.products
      .filter((p) => p.isActive && p.stockQuantity <= p.lowStockThreshold)
      .sort((a, b) => a.stockQuantity - b.stockQuantity)
      .slice(0, 5),
    recentOrders: [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
  };
}
async function dispatch(w: Workspace, config: InternalAxiosRequestConfig) {
  const url = new URL(config.url ?? '/', 'https://demo.local');
  const path = url.pathname.replace(/^\/api\/v1/, '');
  const method = config.method ?? 'get';
  const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  const query = { ...Object.fromEntries(url.searchParams), ...config.params };
  const actor =
    w.users.find((u) => u.id === w.actorId) ?? fail(403, 'Reset the demo to start over.');
  const me = () => ({ ...publicUser(actor), isDemo: true });
  if (path === '/auth/csrf' && method === 'get') return { data: { token: 'browser-local-demo' } };
  if (path === '/demo/reset' && method === 'post') {
    Object.assign(w, await fresh());
    return { data: { ...publicUser(w.users[0]), isDemo: true } };
  }
  if (path === '/auth/me' || path === '/auth/refresh') return { data: me() };
  if (path === '/auth/logout' && method === 'post') return undefined;
  if (path === '/auth/login' && method === 'post') {
    const input = v.loginInput.parse(body),
      user =
        w.users.find((u) => u.email === input.email && u.isActive) ??
        fail(401, 'Invalid email or password.');
    if (
      !user ||
      (await hashPassword(input.password, user.passwordHash.split(':')[0])) !== user.passwordHash
    )
      fail(401, 'Invalid email or password.');
    w.actorId = user.id;
    return { data: { ...publicUser(user), isDemo: true } };
  }
  if (!actor.isActive) fail(403, 'Your demo account is inactive. Reset the demo to start over.');
  const adminOnly =
    path.startsWith('/users') ||
    (path.startsWith('/analytics/') && path !== '/analytics/overview') ||
    (path.startsWith('/products') && method !== 'get') ||
    (path === '/settings' && method !== 'get');
  if (adminOnly && actor.role !== 'ADMIN') fail(403, 'Administrator access is required.');
  if (method === 'get' && ['/products', '/orders', '/users'].includes(path)) {
    const q = v.listInput.parse(query),
      kind = path.slice(1) as 'products' | 'orders' | 'users';
    let rows: Record<string, any>[] = kind === 'users' ? w.users.map(publicUser) : [...w[kind]];
    if (q.search)
      rows = rows.filter((r) =>
        (kind === 'products'
          ? [r.name, r.sku]
          : kind === 'orders'
            ? [r.orderNumber, r.customerName, r.customerEmail]
            : [r.name, r.email]
        ).some((s) => s.toLowerCase().includes(q.search.toLowerCase())),
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
        const { start, end } = range(q);
        rows = rows.filter((r) => new Date(r.createdAt) >= start && new Date(r.createdAt) <= end);
      }
    }
    const key = (kind === 'products'
      ? ['name', 'price', 'stockQuantity', 'createdAt']
      : kind === 'orders'
        ? ['totalAmount', 'createdAt']
        : ['createdAt']
    ).includes(q.sort)
      ? q.sort
      : 'createdAt';
    rows.sort(
      (a, b) =>
        (a[key] > b[key]
          ? 1
          : a[key] < b[key]
            ? -1
            : String(a._id ?? a.id).localeCompare(String(b._id ?? b.id))) *
        (q.direction === 'asc' ? 1 : -1),
    );
    return {
      data: rows.slice((q.page - 1) * q.limit, q.page * q.limit),
      meta: {
        total: rows.length,
        page: q.page,
        limit: q.limit,
        ...(kind === 'products'
          ? { categories: [...new Set(w.products.map((p) => p.category))] }
          : {}),
      },
    };
  }
  const parts = path.split('/'),
    id = parts[2];
  if (path === '/products' && method === 'post') {
    const input = v.productInput.parse(body);
    unique(w.products, 'sku', input.sku);
    if (w.products.length >= 500) fail(409, 'Reset the demo to add more products.');
    const p: Product = { ...input, _id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    w.products.push(p);
    return { data: p };
  }
  if (parts[1] === 'products' && id && parts.length === 3) {
    const p = find(w.products, id, 'Product');
    if (method === 'get') return { data: p };
    if (method === 'patch') {
      const input = v.productInput.partial().parse(body);
      if (input.sku) unique(w.products, 'sku', input.sku, id);
      Object.assign(p, input);
      return { data: p };
    }
    if (method === 'delete') {
      p.isActive = false;
      return undefined;
    }
  }
  if (parts[1] === 'orders' && id) {
    const o = find(w.orders, id, 'Order');
    if (method === 'get' && parts.length === 3) return { data: o };
    if (method === 'patch' && parts[3] === 'status' && parts.length === 4) {
      const { status } = v.statusInput.parse(body);
      if (
        !transitions[o.orderStatus].includes(status) ||
        (status === 'Cancelled' && actor.role !== 'ADMIN')
      )
        fail(409, 'This order status transition is not permitted.');
      o.history.push({
        from: o.orderStatus,
        to: status,
        actor: { name: actor.name },
        at: new Date().toISOString(),
      });
      o.orderStatus = status;
      if (status === 'Cancelled') {
        for (const item of o.items)
          find(w.products, item.product, 'Product').stockQuantity += item.quantity;
        if (o.paymentStatus === 'Paid') o.paymentStatus = 'Refunded';
      }
      return { data: o };
    }
  }
  if (path === '/users' && method === 'post') {
    const { password, ...input } = v.userInput.parse(body);
    unique(w.users, 'email', input.email);
    if (w.users.length >= 50) fail(409, 'Reset the demo to add more team members.');
    const user: Person = {
      ...input,
      id: crypto.randomUUID(),
      isActive: true,
      createdAt: new Date().toISOString(),
      passwordHash: await hashPassword(password),
    };
    w.users.push(user);
    return { data: publicUser(user) };
  }
  if (parts[1] === 'users' && id && method === 'patch') {
    const user = w.users.find((u) => u.id === id) ?? fail(404, 'User not found.'),
      input = v.userPatch.parse(body);
    if (input.email) unique(w.users, 'email', input.email, id);
    if (
      user.role === 'ADMIN' &&
      user.isActive &&
      (input.role === 'STAFF' || input.isActive === false) &&
      w.users.filter((u) => u.role === 'ADMIN' && u.isActive).length <= 1
    )
      fail(409, 'Keep at least one active administrator.');
    Object.assign(user, input);
    return { data: publicUser(user) };
  }
  if (path === '/settings') {
    if (method === 'get') return { data: w.shop };
    if (method === 'patch') {
      Object.assign(w.shop, v.shopInput.parse(body));
      return { data: w.shop };
    }
  }
  if (path === '/profile' && method === 'patch') {
    const input = v.profileInput.parse(body);
    unique(w.users, 'email', input.email, actor.id);
    Object.assign(actor, input);
    return { data: publicUser(actor) };
  }
  if (path === '/profile/password' && method === 'post') {
    const input = v.passwordInput.parse(body);
    if (
      (await hashPassword(input.currentPassword, actor.passwordHash.split(':')[0])) !==
      actor.passwordHash
    )
      fail(400, 'Current password is incorrect.');
    actor.passwordHash = await hashPassword(input.password);
    return undefined;
  }
  if (parts[1] === 'analytics' && method === 'get') {
    const result = analytics(w, query);
    if (id === 'overview') return { data: result };
    if (id === 'top-products') return { data: result.topProducts };
    if (id === 'revenue') return { data: { series: result.series, categories: result.categories } };
    if (id === 'orders') return { data: { series: result.series, statuses: result.statuses } };
  }
  return fail(404, 'Endpoint not found.');
}
/** The public portfolio build uses only local demo data; this adapter never makes network requests. */
export function createDemoAdapter(storage: StorageAccess): AxiosAdapter {
  let pending: Promise<unknown> = Promise.resolve();
  return (config) => {
    const run = async () => {
      try {
        let w: Workspace | undefined;
        try {
          w = JSON.parse(storage.getItem(DEMO_STORAGE_KEY) ?? 'null');
        } catch {
          /* Reset invalid local data. */
        }
        if (
          !w ||
          w.version !== 1 ||
          !Number.isFinite(w.expires) ||
          w.expires <= Date.now() ||
          !Array.isArray(w.products) ||
          !Array.isArray(w.users) ||
          !Array.isArray(w.orders)
        )
          w = await fresh();
        const data = await dispatch(w, config);
        try {
          storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(w));
        } catch {
          fail(
            507,
            'Your browser cannot save this demo. Allow site storage or free some space, then retry.',
          );
        }
        return {
          config,
          data: data === undefined ? undefined : JSON.parse(JSON.stringify(data)),
          status:
            data === undefined
              ? 204
              : config.method === 'post' && ['/products', '/users'].includes(config.url ?? '')
                ? 201
                : 200,
          statusText: 'OK',
          headers: new AxiosHeaders(),
        };
      } catch (e) {
        const status = e instanceof DemoError ? e.status : 400;
        const message = e instanceof DemoError ? e.message : 'Please check the submitted fields.';
        throw new AxiosError(message, 'ERR_BAD_RESPONSE', config, undefined, {
          config,
          data: { error: { message } },
          status,
          statusText: 'Error',
          headers: new AxiosHeaders(),
        });
      }
    };
    const task = async () =>
      typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request(DEMO_STORAGE_KEY, run)
        : run();
    const result = pending.then(task, task);
    pending = result.catch(() => {});
    return result;
  };
}
