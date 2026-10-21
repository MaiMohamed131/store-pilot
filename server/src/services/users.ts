import { withTransaction } from './database.js';
import argon2 from 'argon2';
import { Guard, User, Session } from '../models/index.js';
import { AppError } from '../middleware/security.js';
export async function updateTeamMember(
  targetId: string,
  actorId: string,
  input: { name?: string; email?: string; role?: 'ADMIN' | 'STAFF'; isActive?: boolean },
) {
  return withTransaction(async (session) => {
    await Guard.findOneAndUpdate(
      { _id: 'admins' },
      { $inc: { revision: 1 } },
      { upsert: true, session },
    );
    const actor = await User.findById(actorId).session(session);
    if (!actor?.isActive || actor.role !== 'ADMIN')
      throw new AppError(403, 'Administrator access is required.');
    const user = await User.findById(targetId).session(session);
    if (!user) throw new AppError(404, 'User not found.');
    if (
      user.role === 'ADMIN' &&
      user.isActive &&
      (input.role === 'STAFF' || input.isActive === false) &&
      (await User.countDocuments({ role: 'ADMIN', isActive: true }).session(session)) <= 1
    )
      throw new AppError(409, 'Keep at least one active administrator.');
    Object.assign(user, input);
    await user.save({ session });
    if (input.isActive === false || input.role)
      await Session.updateMany(
        { user: user._id },
        { $set: { revokedAt: new Date() } },
        { session },
      );
    return user;
  });
}
export async function changePassword(userId: string, currentPassword: string, password: string) {
  const user = await User.findById(userId).select('+passwordHash +tokenVersion');
  if (!user || !(await argon2.verify(user.passwordHash, currentPassword)))
    throw new AppError(400, 'Current password is incorrect.');
  const passwordHash = await argon2.hash(password);
  await withTransaction(async (session) => {
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash }, $inc: { tokenVersion: 1 } },
      { session },
    );
    await Session.updateMany({ user: user._id }, { $set: { revokedAt: new Date() } }, { session });
  });
}
