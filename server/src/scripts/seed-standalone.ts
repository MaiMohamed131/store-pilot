// Insert-only historical catalog/order import. Does not touch users, sessions, settings, or server configuration.
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { buildDemoData, validateDemoData, DEMO_SEED } from '../services/demo-data.js';
const { EJSON } = mongoose.mongo.BSON;
type Document = mongoose.mongo.Document;
const client = new mongoose.mongo.MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
const hash = (value: unknown) =>
  createHash('sha256')
    .update(EJSON.stringify(value, { relaxed: false }))
    .digest('hex');
async function main() {
  await client.connect();
  const db = client.db();
  const existingCollections = await db.listCollections({}, { nameOnly: true }).toArray();
  const before: { collection: string; id: unknown; digest: string }[] = [];
  for (const { name } of existingCollections)
    for await (const record of db.collection(name).find({}))
      before.push({ collection: name, id: record._id, digest: hash(record) });
  const directory = fileURLToPath(new URL('../../../.cache/demo-seed/', import.meta.url));
  await mkdir(directory, { recursive: true });
  const receipt = `${directory}before-${Date.now()}.json`;
  await writeFile(
    receipt,
    EJSON.stringify(
      { database: db.databaseName, seed: DEMO_SEED, documents: before },
      { relaxed: false },
    ),
    { flag: 'wx' },
  );
  const products = db.collection('products');
  const orders = db.collection('orders');
  const previous =
    (await products.findOne({ demoSeed: DEMO_SEED }, { projection: { demoSeedDate: 1 } })) ??
    (await orders.findOne({ demoSeed: DEMO_SEED }, { projection: { demoSeedDate: 1 } }));
  const anchor = previous?.demoSeedDate instanceof Date ? previous.demoSeedDate : new Date();
  const plan = buildDemoData(anchor);
  const validation = validateDemoData(plan);
  // Abort before writes if this namespace collides with any pre-existing non-demo record.
  for (const [collection, documents, key] of [
    [products, plan.products, 'sku'],
    [orders, plan.orders, 'orderNumber'],
  ] as const) {
    const plannedIds = new Set(documents.map((d) => String(d._id)));
    const values = documents.map((d) => (d as unknown as Document)[key]);
    const occupied = await collection
      .find({ $or: [{ _id: { $in: documents.map((d) => d._id) } }, { [key]: { $in: values } }] })
      .toArray();
    if (occupied.some((d) => d.demoSeed !== DEMO_SEED || !plannedIds.has(String(d._id))))
      throw new Error(
        `Demo namespace collision in ${collection.collectionName}. No records were inserted or overwritten.`,
      );
  }
  const inserted = { products: 0, orders: 0 };
  for (const [collection, documents, key] of [
    [products, plan.products, 'sku'],
    [orders, plan.orders, 'orderNumber'],
  ] as const) {
    for (const document of documents) {
      const record = document as unknown as Document;
      const result = await collection.updateOne(
        { $or: [{ _id: document._id }, { [key]: record[key] }] },
        { $setOnInsert: document },
        { upsert: true },
      );
      if (result.modifiedCount !== 0)
        throw new Error('Unexpected modification of an existing record.');
      if (result.upsertedCount) inserted[collection.collectionName as keyof typeof inserted]++;
    }
  }
  // Verify every document that existed before the import, including the admin hash and session records.
  for (const record of before) {
    const current = await db
      .collection(record.collection)
      .findOne({ _id: record.id as mongoose.Types.ObjectId });
    if (!current || hash(current) !== record.digest)
      throw new Error(
        `Existing ${record.collection} record changed during the import; check for concurrent application activity. The importer uses insert-only updates.`,
      );
  }
  const savedProducts = await products.find({ demoSeed: DEMO_SEED }).toArray();
  const savedOrders = await orders.find({ demoSeed: DEMO_SEED }).toArray();
  if (savedProducts.length !== 40 || savedOrders.length !== 240)
    throw new Error(
      'Demo batch incomplete. Rerun to insert missing records; existing records will be preserved.',
    );
  const ids = new Set(savedProducts.map((p) => String(p._id)));
  for (const order of savedOrders) {
    let subtotal = 0;
    for (const item of order.items) {
      if (!ids.has(String(item.product)) || item.quantity * item.unitPrice !== item.lineTotal)
        throw new Error('Stored demo item failed validation.');
      subtotal += item.lineTotal;
    }
    if (subtotal !== order.subtotal || subtotal + order.shippingAmount !== order.totalAmount)
      throw new Error('Stored demo totals failed validation.');
  }
  const recognizedRevenue = savedOrders
    .filter((o) => o.paymentStatus === 'Paid' && o.orderStatus !== 'Cancelled')
    .reduce((sum, o) => sum + o.totalAmount, 0);
  console.log(
    JSON.stringify(
      {
        database: db.databaseName,
        inserted,
        demoTotals: {
          products: savedProducts.length,
          orders: savedOrders.length,
          categories: new Set(savedProducts.map((p) => p.category)).size,
        },
        existingDocumentsVerifiedUnchanged: before.length,
        recognizedRevenueMinorUnits: recognizedRevenue,
        plannedRevenueMinorUnits: validation.revenue,
        snapshot: receipt,
        inventoryRule:
          'Historical import with closing stock already reflecting non-cancelled demo orders. No stock updates on existing products.',
      },
      null,
      2,
    ),
  );
}
try {
  await main();
} finally {
  await client.close();
}
