import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../server/.env', import.meta.url)), quiet: true });
const client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
});
try {
  await client.connect();
  const db = client.db();
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const counts = {};
  for (const { name } of collections) counts[name] = await db.collection(name).countDocuments();
  const hello = await db.admin().command({ hello: 1 });
  console.log(
    JSON.stringify(
      { database: db.databaseName, topology: hello.setName ? 'replica set' : 'standalone', counts },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
