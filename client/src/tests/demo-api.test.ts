import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import axios from 'axios';
import { createDemoAdapter, DEMO_STORAGE_KEY } from '../lib/demo-api';
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};
const product = {
  name: 'Visitor Product',
  sku: 'PRIVATE-1',
  category: 'Accessories',
  price: 2500,
  stockQuantity: 20,
  lowStockThreshold: 5,
};
const make = (s = storage()) => axios.create({ adapter: createDemoAdapter(s) });
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.useRealTimers();
});
describe('Vercel browser-local demo', () => {
  it('opens without a server and preserves changes after reload in the same browser', async () => {
    const s = storage(),
      a = make(s);
    expect((await a.get('/auth/me')).data.data.isDemo).toBe(true);
    expect((await a.get('/products')).data.meta.total).toBe(40);
    const created = (await a.post('/products', product)).data.data;
    const reloaded = make(s);
    expect((await reloaded.get('/products/' + created._id)).data.data.name).toBe(product.name);
    expect((await reloaded.get('/analytics/overview')).data.data.metrics.products).toBe(41);
  });
  it('isolates visitors and reset affects only the current browser', async () => {
    const a = make(),
      b = make();
    const id = (await a.post('/products', product)).data.data._id;
    await expect(b.get('/products/' + id)).rejects.toMatchObject({ response: { status: 404 } });
    await b.patch('/settings', { name: 'Other shop', email: '', currency: 'EUR', address: '' });
    await a.post('/demo/reset');
    await expect(a.get('/products/' + id)).rejects.toMatchObject({ response: { status: 404 } });
    expect((await b.get('/settings')).data.data.name).toBe('Other shop');
  });
  it('cancels orders once, restores stock, and validates input', async () => {
    const a = make();
    const order = (await a.get('/orders', { params: { status: 'Pending' } })).data.data[0],
      item = order.items[0];
    const before = (await a.get('/products/' + item.product)).data.data.stockQuantity;
    await a.patch('/orders/' + order._id + '/status', { status: 'Cancelled' });
    await expect(
      a.patch('/orders/' + order._id + '/status', { status: 'Cancelled' }),
    ).rejects.toMatchObject({ response: { status: 409 } });
    expect((await a.get('/products/' + item.product)).data.data.stockQuantity).toBe(
      before + item.quantity,
    );
    await expect(a.post('/products', { ...product, price: -1 })).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
  it('supports team, profile and password edits and prevents removing the last admin', async () => {
    const a = make();
    const me = (await a.get('/auth/me')).data.data;
    await expect(a.patch('/users/' + me.id, { role: 'STAFF' })).rejects.toMatchObject({
      response: { status: 409 },
    });
    const member = (
      await a.post('/users', {
        name: 'New Staff',
        email: 'new@example.test',
        role: 'STAFF',
        password: 'DemoPassword123!',
      })
    ).data.data;
    expect(member.passwordHash).toBeUndefined();
    await a.patch('/users/' + member.id, { isActive: false });
    await a.patch('/profile', { name: 'My Visitor', email: 'mine@example.test' });
    await a.post('/profile/password', {
      currentPassword: 'DemoPassword123!',
      password: 'ChangedPassword123!',
    });
    expect(
      (await a.post('/auth/login', { email: 'mine@example.test', password: 'ChangedPassword123!' }))
        .data.data.name,
    ).toBe('My Visitor');
  });
  it('restarts expired and invalid saved workspaces', async () => {
    const s = storage(),
      a = make(s);
    await a.post('/products', product);
    const saved = JSON.parse(s.getItem(DEMO_STORAGE_KEY)!);
    saved.expires = Date.now() - 1;
    s.setItem(DEMO_STORAGE_KEY, JSON.stringify(saved));
    expect((await a.get('/products')).data.meta.total).toBe(40);
    s.setItem(DEMO_STORAGE_KEY, 'broken JSON');
    expect((await a.get('/orders')).data.meta.total).toBe(240);
  });
  it('serializes concurrent edits and reports blocked browser storage', async () => {
    const a = make();
    await Promise.all([
      a.post('/products', product),
      a.post('/products', { ...product, sku: 'PRIVATE-2' }),
    ]);
    expect((await a.get('/products')).data.meta.total).toBe(42);
    const blocked = make({
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    });
    await expect(blocked.get('/auth/me')).rejects.toMatchObject({ response: { status: 507 } });
  });
});
