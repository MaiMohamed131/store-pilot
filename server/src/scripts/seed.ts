import mongoose from 'mongoose';
import argon2 from 'argon2';
import { env } from '../config/env.js';
import { User, Product, Order, Shop, Guard, Session } from '../models/index.js';
import { calculateTotals } from '../services/orders.js';
import { supportsTransactions } from '../services/database.js';
export async function seed() {
  if (!(await supportsTransactions()))
    throw new Error(
      'Demo seeding requires a replica set. No seed data was written; StorePilot will not reconfigure your existing server.',
    );
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error('Set SEED_PASSWORD to at least 12 characters in server/.env.');
  const emails = [
    process.env.SEED_ADMIN_EMAIL,
    process.env.SEED_STAFF_EMAIL,
    process.env.SEED_SECOND_STAFF_EMAIL,
  ];
  if (emails.some((e) => !e)) throw new Error('Configure all three SEED_*_EMAIL variables.');
  await Guard.updateOne({ _id: 'admins' }, { $setOnInsert: { revision: 0 } }, { upsert: true });
  // Explicit seed provisioning may create indexes, but only after topology validation.
  await Promise.all([
    User.createIndexes(),
    Product.createIndexes(),
    Order.createIndexes(),
    Shop.createIndexes(),
    Session.createIndexes(),
  ]);
  const people = ['Jordan Morgan', 'Sam Wilson', 'Alex Chen'];
  const users = [];
  for (let i = 0; i < 3; i++)
    users.push(
      await User.findOneAndUpdate(
        { email: emails[i] },
        {
          $setOnInsert: {
            name: people[i],
            email: emails[i],
            passwordHash: await argon2.hash(password),
            role: i === 0 ? 'ADMIN' : 'STAFF',
            isActive: true,
          },
        },
        { upsert: true, new: true },
      ),
    );
  const catalog: Record<string, string[]> = {
    'Home & Living': [
      'Ceramic Pour-Over Set',
      'Linen Cushion Cover',
      'Amber Glass Candle',
      'Oak Serving Board',
      'Cotton Throw Blanket',
      'Stoneware Dinner Plate',
      'Woven Storage Basket',
      'Minimal Wall Clock',
    ],
    Accessories: [
      'Everyday Canvas Tote',
      'Classic Leather Wallet',
      'Ribbed Beanie',
      'Canvas Weekender Bag',
      'Stainless Water Bottle',
      'Travel Organizer',
      'Wool Blend Scarf',
      'Everyday Keyring',
    ],
    Stationery: [
      'Dotted Hardcover Journal',
      'Brass Ballpoint Pen',
      'Weekly Desk Planner',
      'Recycled Notebook Set',
      'Leather Desk Mat',
      'Washi Tape Collection',
      'Wooden Pencil Set',
      'Document Pouch',
    ],
    Electronics: [
      'Wireless Desk Charger',
      'Portable Bluetooth Speaker',
      'Braided USB-C Cable',
      'Compact Power Bank',
      'LED Reading Lamp',
      'Wireless Mouse',
      'Laptop Stand',
      'Digital Alarm Clock',
    ],
    Wellness: [
      'Botanical Hand Soap',
      'Lavender Bath Salts',
      'Essential Oil Blend',
      'Natural Lip Balm Set',
      'Cork Yoga Block',
      'Herbal Tea Collection',
      'Cotton Eye Pillow',
      'Reusable Heat Pack',
    ],
  };
  const products: {
    _id: mongoose.Types.ObjectId;
    name: string;
    sku: string;
    category: string;
    price: number;
  }[] = [];
  let idx = 0;
  for (const [category, names] of Object.entries(catalog))
    for (const name of names) {
      const sku = `SP-${String(++idx).padStart(4, '0')}`;
      products.push(
        await Product.findOneAndUpdate(
          { sku },
          {
            $setOnInsert: {
              name,
              sku,
              category,
              description: `Thoughtfully designed ${name.toLowerCase()} for everyday use. Made with quality materials and built to last.`,
              price: 1295 + ((idx * 427) % 9000),
              stockQuantity: 0,
              lowStockThreshold: 10,
              imageUrl: '',
              isActive: true,
            },
          },
          { upsert: true, new: true },
        ),
      );
    }
  // Only create the demo order set once. Later seed runs never rewrite live inventory.
  if (!(await Order.exists({ orderNumber: 'SP-1001' })))
    await mongoose.connection.transaction(async (session) => {
      const consumed = new Map<string, number>();
      const today = new Date();
      for (let i = 0; i < 240; i++) {
        const status = [
          'Delivered',
          'Delivered',
          'Delivered',
          'Shipped',
          'Processing',
          'Pending',
          'Cancelled',
        ][i % 7];
        const items = [];
        for (let j = 0; j < 1 + (i % 3); j++) {
          const p = products[(i * 7 + j * 11) % products.length];
          const quantity = 1 + ((i + j) % 3);
          items.push({
            product: p._id,
            name: p.name!,
            sku: p.sku!,
            category: p.category!,
            quantity,
            unitPrice: p.price!,
            lineTotal: quantity * p.price!,
          });
          if (status !== 'Cancelled')
            consumed.set(String(p._id), (consumed.get(String(p._id)) ?? 0) + quantity);
        }
        const shippingAmount = i % 4 === 0 ? 0 : 500;
        const createdAt = new Date(
          today.getTime() - ((i * 37) % 90) * 86400000 - ((i * 71) % 720) * 60000,
        );
        await Order.create(
          [
            {
              orderNumber: `SP-${1001 + i}`,
              customerName: [
                'Olivia Martin',
                'Liam Anderson',
                'Emma Thompson',
                'Noah Williams',
                'Ava Robinson',
                'Ethan Davis',
                'Sophia Chen',
                'James Wilson',
              ][i % 8],
              customerEmail: `customer${i + 1}@example.test`,
              items,
              ...calculateTotals(items, shippingAmount),
              shippingAmount,
              orderStatus: status,
              paymentStatus: status === 'Cancelled' ? 'Refunded' : i % 13 === 0 ? 'Unpaid' : 'Paid',
              history: [],
              createdAt,
              updatedAt: createdAt,
            },
          ],
          { session },
        );
      }
      for (let k = 0; k < products.length; k++) {
        const p = products[k];
        const closing = k % 8 === 0 ? 3 + (k % 6) : 18 + ((k * 13) % 100);
        const opening = closing + (consumed.get(String(p._id)) ?? 0);
        await Product.updateOne(
          { _id: p._id },
          { $set: { stockQuantity: opening - (consumed.get(String(p._id)) ?? 0) } },
          { session },
        );
      }
    });
  await Shop.updateOne(
    { key: 'main' },
    {
      $setOnInsert: {
        name: 'The Everyday Store',
        currency: 'USD',
        email: 'hello@example.test',
        address: '128 Market Street, Portland, OR',
      },
    },
    { upsert: true },
  );
  console.log(
    'Demo ready: 3 users, 40 products, 240 orders. Credentials come from your environment.',
  );
}
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  try {
    await mongoose.connect(env.MONGODB_URI, { autoCreate: false, autoIndex: false });
    await seed();
  } finally {
    await mongoose.disconnect();
  }
}
