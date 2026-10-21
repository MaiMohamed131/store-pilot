import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import argon2 from 'argon2';
import { app } from '../app.js';
import { User, Product, Order, Guard } from '../models/index.js';
import { calculateTotals, recognizesRevenue } from '../services/orders.js';
import { seed } from '../scripts/seed.js';
let mongo: MongoMemoryReplSet;
let admin: ReturnType<typeof request.agent>;
let staff: ReturnType<typeof request.agent>;
let adminCsrf: string;
let staffCsrf: string;
let productId: string;
let orderId: string;
let adminId: string;
const password = 'Local-test-password-2026';
const input = {
  name: 'Ceramic Cup',
  sku: 'CUP-01',
  description: 'Handmade ceramic cup',
  category: 'Home',
  price: 2595,
  stockQuantity: 20,
  lowStockThreshold: 5,
  imageUrl: '',
  isActive: true,
};
async function signedIn(email: string) {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.token;
  const response = await agent
    .post('/api/v1/auth/login')
    .set('x-csrf-token', csrf)
    .send({ email, password });
  expect(response.status).toBe(200);
  return { agent, csrf, response };
}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: process.env.MONGOMS_VERSION ?? '8.0.14' },
  });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), SessionInit(), Product.init(), Order.init()]);
  const passwordHash = await argon2.hash(password);
  const a = await User.create({
    name: 'Admin',
    email: 'admin@test.local',
    role: 'ADMIN',
    passwordHash,
  });
  adminId = String(a._id);
  await User.create({ name: 'Staff', email: 'staff@test.local', role: 'STAFF', passwordHash });
  await Guard.create({ _id: 'admins' });
  const x = await signedIn('admin@test.local');
  admin = x.agent;
  adminCsrf = x.csrf;
  const y = await signedIn('staff@test.local');
  staff = y.agent;
  staffCsrf = y.csrf;
});
async function SessionInit() {
  const { Session } = await import('../models/index.js');
  await Session.init();
}
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop({ doCleanup: false });
});
describe('Authentication and authorization', () => {
  it('keeps CSRF tokens stable across tabs', async () => {
    const agent = request.agent(app);
    const first = (await agent.get('/api/v1/auth/csrf')).body.data.token;
    expect((await agent.get('/api/v1/auth/csrf')).body.data.token).toBe(first);
  });
  it('revokes concurrently replayed refresh tokens including the new session', async () => {
    const x = await signedIn('admin@test.local');
    const cookie = (x.response.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('refresh='))!
      .split(';')[0];
    const rotate = () =>
      request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [cookie, `csrf=${x.csrf}`])
        .set('x-csrf-token', x.csrf);
    const results = await Promise.all([rotate(), rotate()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    const success = results.find((r) => r.status === 200)!;
    const cookies = (success.headers['set-cookie'] as unknown as string[]).map(
      (c) => c.split(';')[0],
    );
    expect((await request(app).get('/api/v1/products').set('Cookie', cookies)).status).toBe(401);
  });
  it('logs in with HttpOnly access and refresh cookies, without leaking hashes', async () => {
    const { response } = await signedIn('admin@test.local');
    expect(response.headers['set-cookie'].join(' ')).toContain('HttpOnly');
    expect(response.body.data.passwordHash).toBeUndefined();
    expect(response.body.data.role).toBe('ADMIN');
  });
  it('rejects invalid login generically', async () => {
    const agent = request.agent(app);
    const token = (await agent.get('/api/v1/auth/csrf')).body.data.token;
    const r = await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', token)
      .send({ email: 'admin@test.local', password: 'wrong' });
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe('Invalid email or password.');
  });
  it('requires authentication for stored data', async () => {
    expect((await request(app).get('/api/v1/products')).status).toBe(401);
  });
  it('requires CSRF for mutations and rejects foreign origins', async () => {
    expect((await admin.post('/api/v1/products').send(input)).status).toBe(403);
    expect(
      (
        await admin
          .post('/api/v1/products')
          .set('x-csrf-token', adminCsrf)
          .set('origin', 'https://attacker.test')
          .send(input)
      ).status,
    ).toBe(403);
  });
  it('rejects staff administration and pricing changes', async () => {
    expect((await staff.get('/api/v1/users')).status).toBe(403);
    expect((await staff.get('/api/v1/analytics/revenue')).status).toBe(403);
    expect(
      (await staff.post('/api/v1/products').set('x-csrf-token', staffCsrf).send(input)).status,
    ).toBe(403);
  });
  it('rotates refresh tokens and revokes the family on replay', async () => {
    const x = await signedIn('admin@test.local');
    const cookies = x.response.headers['set-cookie'] as unknown as string[];
    const refreshCookie = cookies.find((c) => c.startsWith('refresh='))!.split(';')[0];
    expect((await x.agent.post('/api/v1/auth/refresh').set('x-csrf-token', x.csrf)).status).toBe(
      200,
    );
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshCookie, `csrf=${x.csrf}`])
      .set('x-csrf-token', x.csrf);
    expect(replay.status).toBe(401);
    expect((await x.agent.get('/api/v1/products')).status).toBe(401);
  });
  it('protects the last active administrator', async () => {
    const r = await admin
      .patch(`/api/v1/users/${adminId}`)
      .set('x-csrf-token', adminCsrf)
      .send({ isActive: false });
    expect(r.status).toBe(409);
  });
});
describe('Product lifecycle', () => {
  it('validates integer money and inventory', async () => {
    const r = await admin
      .post('/api/v1/products')
      .set('x-csrf-token', adminCsrf)
      .send({ ...input, price: 1.5, stockQuantity: -1 });
    expect(r.status).toBe(400);
  });
  it('creates and updates stored products', async () => {
    const created = await admin.post('/api/v1/products').set('x-csrf-token', adminCsrf).send(input);
    expect(created.status).toBe(201);
    productId = created.body.data._id;
    const r = await admin
      .patch(`/api/v1/products/${productId}`)
      .set('x-csrf-token', adminCsrf)
      .send({ price: 2995 });
    expect(r.status).toBe(200);
    expect((await Product.findById(productId))?.price).toBe(2995);
    expect(
      (
        await staff
          .patch(`/api/v1/products/${productId}`)
          .set('x-csrf-token', staffCsrf)
          .send({ price: 1 })
      ).status,
    ).toBe(403);
  });
  it('filters, sorts and paginates on the server', async () => {
    const r = await staff.get(
      '/api/v1/products?search=CUP&category=Home&sort=price&direction=asc&limit=1',
    );
    expect(r.status).toBe(200);
    expect(r.body.meta.total).toBe(1);
    expect(r.body.data[0].sku).toBe('CUP-01');
  });
});
describe('Orders and revenue', () => {
  beforeAll(async () => {
    const item = {
      product: productId,
      name: 'Ceramic Cup',
      sku: 'CUP-01',
      category: 'Home',
      quantity: 2,
      unitPrice: 2595,
      lineTotal: 5190,
    };
    const order = await Order.create({
      orderNumber: 'TEST-01',
      customerName: 'Taylor',
      customerEmail: 'taylor@test.local',
      items: [item],
      subtotal: 5190,
      shippingAmount: 500,
      totalAmount: 5690,
      orderStatus: 'Pending',
      paymentStatus: 'Paid',
    });
    orderId = String(order._id);
  });
  it('allows fulfillment and rejects skipped steps', async () => {
    expect(
      (
        await staff
          .patch(`/api/v1/orders/${orderId}/status`)
          .set('x-csrf-token', staffCsrf)
          .send({ status: 'Delivered' })
      ).status,
    ).toBe(409);
    expect(
      (
        await staff
          .patch(`/api/v1/orders/${orderId}/status`)
          .set('x-csrf-token', staffCsrf)
          .send({ status: 'Processing' })
      ).status,
    ).toBe(200);
    expect((await Product.findById(productId))?.stockQuantity).toBe(20);
  });
  it('records actor and rejects staff cancellation', async () => {
    expect(
      (
        await staff
          .patch(`/api/v1/orders/${orderId}/status`)
          .set('x-csrf-token', staffCsrf)
          .send({ status: 'Cancelled' })
      ).status,
    ).toBe(409);
    const order = await Order.findById(orderId);
    expect(order?.history[0].actor).toBeTruthy();
  });
  it('aggregates eligible revenue and fills missing days', async () => {
    const r = await admin.get('/api/v1/analytics/overview');
    expect(r.status).toBe(200);
    expect(r.body.data.metrics.revenue).toBe(5690);
    expect(r.body.data.series).toHaveLength(30);
    expect(r.body.data.topProducts[0].revenue).toBe(5190);
  });
  it('restores stock exactly once on cancellation and removes revenue', async () => {
    expect(
      (
        await admin
          .patch(`/api/v1/orders/${orderId}/status`)
          .set('x-csrf-token', adminCsrf)
          .send({ status: 'Cancelled' })
      ).status,
    ).toBe(200);
    expect((await Product.findById(productId))?.stockQuantity).toBe(22);
    expect(
      (
        await admin
          .patch(`/api/v1/orders/${orderId}/status`)
          .set('x-csrf-token', adminCsrf)
          .send({ status: 'Cancelled' })
      ).status,
    ).toBe(409);
    expect((await Product.findById(productId))?.stockQuantity).toBe(22);
    expect((await admin.get('/api/v1/analytics/overview')).body.data.metrics.revenue).toBe(0);
  });
  it('archives products without losing snapshots', async () => {
    expect(
      (await admin.delete(`/api/v1/products/${productId}`).set('x-csrf-token', adminCsrf)).status,
    ).toBe(204);
    expect((await Product.findById(productId))?.isActive).toBe(false);
    expect((await Order.findById(orderId))?.items[0].unitPrice).toBe(2595);
  });
  it('calculates exact totals and revenue eligibility', () => {
    expect(calculateTotals([{ quantity: 3, unitPrice: 1999 }], 500)).toEqual({
      subtotal: 5997,
      totalAmount: 6497,
    });
    expect(() => calculateTotals([{ quantity: 1, unitPrice: 1.1 }], 0)).toThrow();
    expect(recognizesRevenue({ paymentStatus: 'Unpaid', orderStatus: 'Delivered' })).toBe(false);
    expect(recognizesRevenue({ paymentStatus: 'Paid', orderStatus: 'Cancelled' })).toBe(false);
    expect(recognizesRevenue({ paymentStatus: 'Refunded', orderStatus: 'Delivered' })).toBe(false);
  });
});
describe('Demo provisioning', () => {
  it('seeds consistent data and preserves records when repeated', async () => {
    Object.assign(process.env, {
      SEED_PASSWORD: 'Isolated-seed-test-password',
      SEED_ADMIN_EMAIL: 'seed-admin@test.local',
      SEED_STAFF_EMAIL: 'seed-staff@test.local',
      SEED_SECOND_STAFF_EMAIL: 'seed-alex@test.local',
    });
    const before = {
      users: await User.countDocuments(),
      products: await Product.countDocuments(),
      orders: await Order.countDocuments(),
    };
    await seed();
    const first = await Product.findOne({ sku: 'SP-0001' }).lean();
    await seed();
    expect(await User.countDocuments()).toBe(before.users + 3);
    expect(await Product.countDocuments()).toBe(before.products + 40);
    expect(await Order.countDocuments()).toBe(before.orders + 240);
    expect((await Product.findOne({ sku: 'SP-0001' }))?.stockQuantity).toBe(first?.stockQuantity);
    const orders = await Order.find({ orderNumber: { $regex: '^SP-' } }).lean();
    for (const order of orders) {
      expect(order.totalAmount).toBe(order.subtotal + order.shippingAmount);
      expect(order.subtotal).toBe(order.items.reduce((n, i) => n + i.lineTotal, 0));
      for (const item of order.items) expect(item.lineTotal).toBe(item.quantity * item.unitPrice);
    }
  }, 60000);
});
