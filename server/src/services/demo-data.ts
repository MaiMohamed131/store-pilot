import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import type { statuses } from '../models/index.js';

export const DEMO_SEED = 'storepilot-catalog-orders-v1';
type Status = (typeof statuses)[number];
export type DemoProduct = {
  _id: mongoose.Types.ObjectId;
  name: string;
  sku: string;
  category: string;
  description: string;
  price: number;
  stockQuantity: number;
  lowStockThreshold: number;
  imageUrl: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  demoSeed: string;
  demoSeedDate: Date;
};
export type DemoOrder = {
  _id: mongoose.Types.ObjectId;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  items: {
    product: mongoose.Types.ObjectId;
    name: string;
    sku: string;
    category: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  shippingAmount: number;
  totalAmount: number;
  orderStatus: Status;
  paymentStatus: string;
  history: never[];
  createdAt: Date;
  updatedAt: Date;
  demoSeed: string;
  demoSeedDate: Date;
};
export const demoId = (kind: string, index: number) =>
  new mongoose.Types.ObjectId(
    createHash('sha256').update(`${DEMO_SEED}:${kind}:${index}`).digest('hex').slice(0, 24),
  );
const catalog: [string, [string, number][]][] = [
  [
    'Home & Living',
    [
      ['Ceramic Pour-Over Set', 4200],
      ['Linen Cushion Cover', 2400],
      ['Amber Glass Candle', 1800],
      ['Oak Serving Board', 3900],
      ['Cotton Throw Blanket', 6500],
      ['Stoneware Dinner Plate', 1600],
      ['Woven Storage Basket', 3200],
      ['Minimal Wall Clock', 4900],
    ],
  ],
  [
    'Accessories',
    [
      ['Everyday Canvas Tote', 2400],
      ['Classic Leather Wallet', 4800],
      ['Ribbed Beanie', 1900],
      ['Canvas Weekender Bag', 8900],
      ['Stainless Water Bottle', 2800],
      ['Travel Organizer', 2200],
      ['Wool Blend Scarf', 3500],
      ['Everyday Keyring', 1200],
    ],
  ],
  [
    'Stationery',
    [
      ['Dotted Hardcover Journal', 1800],
      ['Brass Ballpoint Pen', 2400],
      ['Weekly Desk Planner', 1600],
      ['Recycled Notebook Set', 1200],
      ['Leather Desk Mat', 4500],
      ['Washi Tape Collection', 900],
      ['Wooden Pencil Set', 800],
      ['Document Pouch', 1500],
    ],
  ],
  [
    'Electronics',
    [
      ['Wireless Desk Charger', 3500],
      ['Portable Bluetooth Speaker', 5900],
      ['Braided USB-C Cable', 1200],
      ['Compact Power Bank', 3900],
      ['LED Reading Lamp', 4900],
      ['Wireless Mouse', 2900],
      ['Laptop Stand', 4500],
      ['Digital Alarm Clock', 3200],
    ],
  ],
  [
    'Wellness',
    [
      ['Botanical Hand Soap', 1200],
      ['Lavender Bath Salts', 1600],
      ['Essential Oil Blend', 1800],
      ['Natural Lip Balm Set', 900],
      ['Cork Yoga Block', 1500],
      ['Herbal Tea Collection', 1400],
      ['Cotton Eye Pillow', 1900],
      ['Reusable Heat Pack', 2400],
    ],
  ],
];
const customers = [
  'Olivia Martin',
  'Liam Anderson',
  'Emma Thompson',
  'Noah Williams',
  'Ava Robinson',
  'Ethan Davis',
  'Sophia Chen',
  'James Wilson',
  'Isabella Taylor',
  'Lucas Brown',
  'Mia Patel',
  'Henry Johnson',
  'Charlotte Lee',
  'Oliver Garcia',
  'Amelia Davis',
  'Benjamin Clark',
  'Harper Lewis',
  'Elijah Walker',
  'Evelyn Young',
  'William Hall',
  'Abigail Allen',
  'Sofia King',
  'Mason Wright',
  'Ella Scott',
];
function totals(items: { quantity: number; unitPrice: number }[], shipping: number) {
  if (
    !Number.isSafeInteger(shipping) ||
    shipping < 0 ||
    items.some(
      (i) =>
        !Number.isSafeInteger(i.quantity) ||
        i.quantity < 1 ||
        !Number.isSafeInteger(i.unitPrice) ||
        i.unitPrice < 0,
    )
  )
    throw new Error('Invalid demo money or quantity.');
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  if (!Number.isSafeInteger(subtotal + shipping))
    throw new Error('Demo total exceeds safe integer range.');
  return { subtotal, totalAmount: subtotal + shipping };
}

/** Historical import: products carry closing stock; orders do not decrement live inventory. */
export function buildDemoData(anchor: Date) {
  if (!Number.isFinite(anchor.getTime())) throw new Error('Invalid demo date.');
  const products: DemoProduct[] = catalog
    .flatMap(([category, entries]) => entries.map(([name, price]) => ({ name, price, category })))
    .map((entry, index) => ({
      ...entry,
      _id: demoId('product', index),
      sku: `DEMO-SP-${String(index + 1).padStart(4, '0')}`,
      description: `${entry.name} — a carefully selected everyday essential from our ${entry.category.toLowerCase()} collection. Practical design, quality materials, and thoughtful details.`,
      stockQuantity: index === 0 ? 0 : index % 8 === 0 ? 3 + (index % 7) : 18 + ((index * 13) % 95),
      lowStockThreshold: 10,
      imageUrl: '',
      isActive: true,
      createdAt: new Date(anchor.getTime() - 100 * 86400000 + index * 60000),
      updatedAt: new Date(anchor),
      demoSeed: DEMO_SEED,
      demoSeedDate: new Date(anchor),
    }));
  const orders: DemoOrder[] = Array.from({ length: 240 }, (_, index) => {
    const age = Math.floor((index * 90) / 240);
    const recent: Status[] = [
      'Pending',
      'Processing',
      'Shipped',
      'Delivered',
      'Delivered',
      'Cancelled',
    ];
    const orderStatus: Status =
      age < 7
        ? recent[index % recent.length]
        : age < 14
          ? index % 6 === 0
            ? 'Cancelled'
            : index % 3 === 0
              ? 'Shipped'
              : 'Delivered'
          : index % 9 === 0
            ? 'Cancelled'
            : 'Delivered';
    const items = Array.from({ length: 1 + (index % 3) }, (_, j) => {
      const product = products[(index * 7 + j * 13) % products.length];
      const quantity = 1 + ((index + j) % 3);
      return {
        product: product._id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        quantity,
        unitPrice: product.price,
        lineTotal: quantity * product.price,
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const shippingAmount = subtotal >= 10000 ? 0 : 595;
    const paymentStatus =
      orderStatus === 'Cancelled'
        ? index % 2 === 0
          ? 'Refunded'
          : 'Unpaid'
        : orderStatus === 'Pending' && index % 2 === 0
          ? 'Unpaid'
          : 'Paid';
    const createdAt = new Date(
      anchor.getTime() - age * 86400000 - (15 + ((index * 79) % 600)) * 60000,
    );
    const customer = index % customers.length;
    return {
      _id: demoId('order', index),
      orderNumber: `DEMO-SP-${1001 + index}`,
      customerName: customers[customer],
      customerEmail: `${customers[customer].toLowerCase().replaceAll(' ', '.')}@example.test`,
      items,
      ...totals(items, shippingAmount),
      shippingAmount,
      orderStatus,
      paymentStatus,
      history: [],
      createdAt,
      updatedAt: new Date(createdAt),
      demoSeed: DEMO_SEED,
      demoSeedDate: new Date(anchor),
    };
  });
  return { products, orders };
}

export function validateDemoData({ products, orders }: ReturnType<typeof buildDemoData>) {
  const ids = new Set(products.map((p) => String(p._id)));
  const consumed = new Map(products.map((p) => [String(p._id), 0]));
  for (const order of orders) {
    const calculated = totals(order.items, order.shippingAmount);
    if (calculated.subtotal !== order.subtotal || calculated.totalAmount !== order.totalAmount)
      throw new Error(`Invalid totals for ${order.orderNumber}`);
    for (const item of order.items) {
      if (!ids.has(String(item.product)) || item.lineTotal !== item.unitPrice * item.quantity)
        throw new Error(`Invalid item for ${order.orderNumber}`);
      if (order.orderStatus !== 'Cancelled')
        consumed.set(
          String(item.product),
          (consumed.get(String(item.product)) ?? 0) + item.quantity,
        );
    }
  }
  for (const product of products)
    if (!Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < 0)
      throw new Error('Invalid closing stock.');
  return {
    openingStock: products.map((p) => ({
      sku: p.sku,
      opening: p.stockQuantity + (consumed.get(String(p._id)) ?? 0),
      closing: p.stockQuantity,
    })),
    revenue: orders
      .filter((o) => o.paymentStatus === 'Paid' && o.orderStatus !== 'Cancelled')
      .reduce((n, o) => n + o.totalAmount, 0),
  };
}
