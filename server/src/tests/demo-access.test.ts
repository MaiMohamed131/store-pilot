import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
vi.mock('../config/env.js', () => ({
  env: {
    DEMO_MODE: true,
    NODE_ENV: 'test',
    CLIENT_ORIGIN: 'http://localhost:5173',
    JWT_SECRET: 'demo-test-secret-with-at-least-32-characters',
  },
}));
import { app } from '../app.js';
import { env } from '../config/env.js';
const visitor = () => request.agent(app);
async function csrf(agent: ReturnType<typeof visitor>) {
  return (await agent.get('/api/v1/auth/csrf')).body.data.token as string;
}
const product = {
  name: 'Visitor Product',
  sku: 'VISITOR-1',
  category: 'Accessories',
  price: 2500,
  stockQuantity: 12,
  lowStockThreshold: 5,
};
afterEach(() => {
  vi.useRealTimers();
  env.DEMO_MODE = true;
});
describe('Private editable portfolio workspaces', () => {
  it('provides a demo identity and sample data without database access', async () => {
    const agent = visitor();
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ role: 'ADMIN', isDemo: true });
    expect(me.headers['set-cookie'][0]).toContain('HttpOnly');
    expect((await agent.get('/api/v1/products')).body.meta.total).toBe(40);
    expect((await agent.get('/api/v1/orders')).body.meta.total).toBe(240);
  });
  it('isolates edits, record IDs, uniqueness and reset between visitors', async () => {
    const a = visitor(),
      b = visitor();
    const tokenA = await csrf(a),
      tokenB = await csrf(b);
    const created = await a.post('/api/v1/products').set('x-csrf-token', tokenA).send(product);
    expect(created.status).toBe(201);
    const id = created.body.data._id;
    expect((await b.get('/api/v1/products/' + id)).status).toBe(404);
    expect(
      (
        await b
          .patch('/api/v1/products/' + id)
          .set('x-csrf-token', tokenB)
          .send({ name: 'Intrusion' })
      ).status,
    ).toBe(404);
    expect(
      (await a.post('/api/v1/products').set('x-csrf-token', tokenA).send(product)).status,
    ).toBe(409);
    expect(
      (await b.post('/api/v1/products').set('x-csrf-token', tokenB).send(product)).status,
    ).toBe(201);
    expect(
      (
        await a
          .patch('/api/v1/settings')
          .set('x-csrf-token', tokenA)
          .send({ name: 'Private shop', email: '', address: '', currency: 'EUR' })
      ).status,
    ).toBe(200);
    expect((await b.get('/api/v1/settings')).body.data.name).toBe('The Everyday Store');
    expect((await a.post('/api/v1/demo/reset').set('x-csrf-token', tokenA)).status).toBe(200);
    expect((await a.get('/api/v1/products/' + id)).status).toBe(404);
    expect((await b.get('/api/v1/products')).body.meta.total).toBe(41);
  });
  it('keeps CSRF and validation active and never falls through unknown endpoints', async () => {
    const a = visitor();
    expect((await a.post('/api/v1/products').send(product)).status).toBe(403);
    const token = await csrf(a);
    expect(
      (
        await a
          .post('/api/v1/products')
          .set('x-csrf-token', token)
          .send({ ...product, price: -1 })
      ).status,
    ).toBe(400);
    expect((await a.get('/api/v1/unknown')).status).toBe(404);
    expect((await a.get('/api/v1/products')).body.meta.total).toBe(40);
  });
  it('cancels orders exactly once, restores stock and updates analytics privately', async () => {
    const a = visitor(),
      b = visitor();
    const token = await csrf(a);
    const orders = (await a.get('/api/v1/orders?status=Pending')).body.data;
    const order = orders[0];
    const item = order.items[0];
    const before = (await a.get('/api/v1/products/' + item.product)).body.data.stockQuantity;
    const otherBefore = (await b.get('/api/v1/products/' + item.product)).body.data.stockQuantity;
    const cancel = () =>
      a
        .patch('/api/v1/orders/' + order._id + '/status')
        .set('x-csrf-token', token)
        .send({ status: 'Cancelled' });
    expect((await cancel()).status).toBe(200);
    expect((await cancel()).status).toBe(409);
    expect((await a.get('/api/v1/products/' + item.product)).body.data.stockQuantity).toBe(
      before + item.quantity,
    );
    expect((await b.get('/api/v1/products/' + item.product)).body.data.stockQuantity).toBe(
      otherBefore,
    );
    expect((await a.get('/api/v1/analytics/overview')).body.data.series.length).toBeGreaterThan(0);
  });
  it('supports team, profile and password changes while guarding the last admin', async () => {
    const a = visitor();
    const token = await csrf(a);
    const me = (await a.get('/api/v1/auth/me')).body.data;
    expect(
      (
        await a
          .patch('/api/v1/users/' + me.id)
          .set('x-csrf-token', token)
          .send({ role: 'STAFF' })
      ).status,
    ).toBe(409);
    const team = await a
      .post('/api/v1/users')
      .set('x-csrf-token', token)
      .send({
        name: 'Demo Staff',
        email: 'new@example.test',
        role: 'STAFF',
        password: 'DemoPassword123!',
      });
    expect(team.status).toBe(201);
    expect(team.body.data.passwordHash).toBeUndefined();
    expect(
      (
        await a
          .patch('/api/v1/users/' + team.body.data.id)
          .set('x-csrf-token', token)
          .send({ isActive: false })
      ).status,
    ).toBe(200);
    expect(
      (
        await a
          .patch('/api/v1/profile')
          .set('x-csrf-token', token)
          .send({ name: 'My Visitor', email: 'mine@example.test' })
      ).status,
    ).toBe(200);
    expect(
      (
        await a
          .post('/api/v1/profile/password')
          .set('x-csrf-token', token)
          .send({ currentPassword: 'DemoPassword123!', password: 'MyNewPassword123!' })
      ).status,
    ).toBe(204);
    expect(
      (
        await a
          .post('/api/v1/auth/login')
          .set('x-csrf-token', token)
          .send({ email: 'mine@example.test', password: 'MyNewPassword123!' })
      ).status,
    ).toBe(200);
    expect((await a.get('/api/v1/auth/me')).body.data).toMatchObject({
      name: 'My Visitor',
      isDemo: true,
    });
  });
  it('starts fresh after expiry', async () => {
    const a = visitor();
    const token = await csrf(a);
    await a.post('/api/v1/products').set('x-csrf-token', token).send(product);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    expect((await a.get('/api/v1/products')).body.meta.total).toBe(40);
  });
  it('restores protected database routes when demo mode is disabled', async () => {
    env.DEMO_MODE = false;
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
  });
});
