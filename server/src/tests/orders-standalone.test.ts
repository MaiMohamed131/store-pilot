import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  stock: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('../models/index.js', () => ({
  Order: { findById: mocks.find, findOneAndUpdate: mocks.update },
  Product: { updateOne: mocks.stock },
}));
vi.mock('../services/database.js', () => ({ withTransaction: mocks.transaction }));
import { changeStatus } from '../services/orders.js';
const actor = {
  id: '507f1f77bcf86cd799439011',
  role: 'STAFF' as const,
  name: 'Test',
  email: 'test@example.test',
};
describe('Standalone fulfillment safety', () => {
  beforeEach(() => vi.resetAllMocks());
  it('advances fulfillment and records history atomically without touching inventory', async () => {
    mocks.find.mockResolvedValue({ orderStatus: 'Pending' });
    mocks.update.mockResolvedValue({ orderStatus: 'Processing' });
    expect(await changeStatus('order-1', 'Processing', actor)).toMatchObject({
      orderStatus: 'Processing',
    });
    expect(mocks.update).toHaveBeenCalledWith(
      { _id: 'order-1', orderStatus: 'Pending' },
      expect.objectContaining({
        $set: { orderStatus: 'Processing' },
        $push: expect.objectContaining({
          history: expect.objectContaining({ from: 'Pending', to: 'Processing' }),
        }),
      }),
      expect.anything(),
    );
    expect(mocks.stock).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('rejects concurrent status changes', async () => {
    mocks.find.mockResolvedValue({ orderStatus: 'Pending' });
    mocks.update.mockResolvedValue(null);
    await expect(changeStatus('order-1', 'Processing', actor)).rejects.toMatchObject({
      status: 409,
    });
  });
  it('does not start cancellation writes when transactions are unavailable', async () => {
    mocks.transaction.mockRejectedValue(
      Object.assign(new Error('Requires transactions'), { status: 503 }),
    );
    await expect(
      changeStatus('order-1', 'Cancelled', { ...actor, role: 'ADMIN' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.stock).not.toHaveBeenCalled();
  });
});
