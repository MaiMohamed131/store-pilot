import { Product, Order, User } from '../models/index.js';
import { listInput } from '../validators/index.js';
import { dateRange } from './analytics.js';
import { publicUser } from '../middleware/security.js';
export const escapeSearch = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export async function listProducts(query: unknown) {
  const q = listInput.parse(query);
  const filter: any = {};
  if (q.active !== 'all') filter.isActive = q.active === 'true';
  if (q.search)
    filter.$or = [
      { name: { $regex: escapeSearch(q.search), $options: 'i' } },
      { sku: { $regex: escapeSearch(q.search), $options: 'i' } },
    ];
  if (q.category) filter.category = q.category;
  if (q.stock === 'out') filter.stockQuantity = 0;
  if (q.stock === 'low')
    filter.$expr = {
      $and: [{ $gt: ['$stockQuantity', 0] }, { $lte: ['$stockQuantity', '$lowStockThreshold'] }],
    };
  if (q.stock === 'healthy') filter.$expr = { $gt: ['$stockQuantity', '$lowStockThreshold'] };
  const sort = ['name', 'price', 'createdAt', 'stockQuantity'].includes(q.sort)
    ? q.sort
    : 'createdAt';
  const [data, total, categories] = await Promise.all([
    Product.find(filter)
      .sort({ [sort]: q.direction === 'asc' ? 1 : -1, _id: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Product.countDocuments(filter),
    Product.distinct('category'),
  ]);
  return { data, meta: { total, page: q.page, limit: q.limit, categories } };
}
export async function listOrders(query: unknown) {
  const q = listInput.parse(query);
  const filter: any = {};
  if (q.search)
    filter.$or = ['orderNumber', 'customerName', 'customerEmail'].map((key) => ({
      [key]: { $regex: escapeSearch(q.search), $options: 'i' },
    }));
  if (q.status) filter.orderStatus = q.status;
  if (q.from || q.to) {
    const { start, end } = dateRange(q);
    filter.createdAt = { $gte: start, $lte: end };
  }
  const sort = q.sort === 'totalAmount' ? 'totalAmount' : 'createdAt';
  const [data, total] = await Promise.all([
    Order.find(filter)
      .sort({ [sort]: q.direction === 'asc' ? 1 : -1, _id: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  return { data, meta: { total, page: q.page, limit: q.limit } };
}
export async function listUsers(query: unknown) {
  const q = listInput.parse(query);
  const filter = q.search
    ? {
        $or: [
          { name: { $regex: escapeSearch(q.search), $options: 'i' } },
          { email: { $regex: escapeSearch(q.search), $options: 'i' } },
        ],
      }
    : {};
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    User.countDocuments(filter),
  ]);
  return { data: users.map(publicUser), meta: { page: q.page, limit: q.limit, total } };
}
