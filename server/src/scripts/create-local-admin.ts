// Explicit opt-in provisioning only. Never run as part of application startup.
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { z } from 'zod';
import { env } from '../config/env.js';
if (!process.argv.includes('--confirm-create'))
  throw new Error(
    'This inserts one administrator into the configured database. Pass --confirm-create only after approving that database change.',
  );
const input = z
  .object({ SEED_ADMIN_EMAIL: z.email(), SEED_PASSWORD: z.string().min(12).max(128) })
  .parse(process.env);
const client = new mongoose.mongo.MongoClient(env.MONGODB_URI);
try {
  await client.connect();
  const users = client.db().collection('users');
  if ((await users.countDocuments()) !== 0)
    throw new Error('Database already has users. No account was created or changed.');
  const now = new Date();
  await users.insertOne({
    name: 'Store administrator',
    email: input.SEED_ADMIN_EMAIL.toLowerCase(),
    passwordHash: await argon2.hash(input.SEED_PASSWORD),
    role: 'ADMIN',
    isActive: true,
    tokenVersion: 0,
    createdAt: now,
    updatedAt: now,
  });
  console.log(
    'Created one administrator using server/.env credentials. No existing records were changed and no demo catalog/orders were seeded.',
  );
} finally {
  await client.close();
}
