import mongoose, { type ClientSession } from 'mongoose';
import { AppError } from '../middleware/security.js';

export async function supportsTransactions(): Promise<boolean> {
  if (!mongoose.connection.db) throw new AppError(503, 'Database is unavailable.');
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  return Boolean(hello.setName) || hello.msg === 'isdbgrid';
}

// Never emulate multi-document transactions with unsafe sequential writes.
export async function withTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  if (!(await supportsTransactions()))
    throw new AppError(
      503,
      'This action requires MongoDB transactions and is unavailable on the connected standalone server. No changes were made. StorePilot will not reconfigure your server.',
    );
  return mongoose.connection.transaction(work);
}
