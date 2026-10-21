// Read-only: never creates users, collections, indexes, or sessions.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../server/.env', import.meta.url)), quiet: true });
const client = new mongoose.mongo.MongoClient(
  process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/storepilot',
  { serverSelectionTimeoutMS: 5000 },
);
try {
  await client.connect();
  const users = client.db().collection('users');
  const account = process.env.SEED_ADMIN_EMAIL
    ? await users.findOne(
        { email: process.env.SEED_ADMIN_EMAIL.toLowerCase() },
        { projection: { _id: 0, isActive: 1, role: 1 } },
      )
    : null;
  console.log(
    JSON.stringify(
      {
        database: client.db().databaseName,
        userCount: await users.countDocuments(),
        configuredAdminExists: !!account,
        configuredAdminActive: account?.isActive ?? null,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
