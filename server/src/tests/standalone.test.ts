import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ command: vi.fn(), transaction: vi.fn() }));
vi.mock('mongoose', () => ({
  default: {
    connection: {
      db: { admin: () => ({ command: mocks.command }) },
      transaction: mocks.transaction,
    },
  },
}));
vi.mock('../middleware/security.js', () => ({
  AppError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
import { supportsTransactions, withTransaction } from '../services/database.js';
describe('Existing standalone server safeguards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('detects standalone using only hello', async () => {
    mocks.command.mockResolvedValue({ isWritablePrimary: true });
    expect(await supportsTransactions()).toBe(false);
    expect(mocks.command).toHaveBeenCalledWith({ hello: 1 });
  });
  it('rejects multi-document changes before executing any work', async () => {
    mocks.command.mockResolvedValue({ isWritablePrimary: true });
    const work = vi.fn();
    await expect(withTransaction(work)).rejects.toMatchObject({ status: 503 });
    expect(work).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([{ setName: 'existing-replica' }, { msg: 'isdbgrid' }])(
    'uses transactions only on supporting topology %j',
    async (hello) => {
      mocks.command.mockResolvedValue(hello);
      mocks.transaction.mockResolvedValue('committed');
      const work = vi.fn();
      expect(await withTransaction(work)).toBe('committed');
      expect(mocks.transaction).toHaveBeenCalledWith(work);
    },
  );
});
