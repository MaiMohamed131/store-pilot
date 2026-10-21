// Read-only verification against the user's server; writes snapshots only in project cache.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../server/.env', import.meta.url)), quiet: true });
const directory = fileURLToPath(new URL('../.cache/startup-verification/', import.meta.url));
await mkdir(directory, { recursive: true });
const client = new mongoose.mongo.MongoClient(
  process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/storepilot',
  { serverSelectionTimeoutMS: 5000 },
);
try {
  await client.connect();
  const db = client.db();
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const snapshot = [];
  for (const collection of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    const indexes = await db.collection(collection.name).listIndexes().toArray();
    snapshot.push({ name: collection.name, indexes });
  }
  const serialized = JSON.stringify(snapshot);
  if (process.argv[2] === 'before') {
    await writeFile(`${directory}before.json`, serialized);
    console.log(`Read-only baseline recorded: ${snapshot.length} collections.`);
  } else {
    const before = await readFile(`${directory}before.json`, 'utf8');
    if (before !== serialized)
      throw new Error('Collection/index metadata changed during verification.');
    const api = await fetch('http://127.0.0.1:4000/api/v1/health');
    const web = await fetch('http://localhost:5173/');
    const proxy = await fetch('http://localhost:5173/api/v1/health');
    if (api.status !== 200 || web.status !== 200 || proxy.status !== 200)
      throw new Error(
        `Startup failed: API ${api.status}, frontend ${web.status}, API proxy ${proxy.status}`,
      );
    console.log(
      JSON.stringify(
        {
          api: { status: api.status, body: await api.json() },
          frontend: {
            status: web.status,
            servesApp: (await web.text()).includes('id="root"'),
            apiProxyStatus: proxy.status,
          },
          databaseMetadata: 'unchanged',
          collections: snapshot.length,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await client.close();
}
