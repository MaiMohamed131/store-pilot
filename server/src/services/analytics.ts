import { Order, Product } from '../models/index.js';
import { AppError } from '../middleware/security.js';
export function dateRange(query: { from?: string; to?: string }) {
  const end = query.to ? new Date(query.to + 'T23:59:59.999Z') : new Date();
  const start = query.from
    ? new Date(query.from + 'T00:00:00.000Z')
    : new Date(new Date(end).setUTCDate(end.getUTCDate() - 29));
  if (!query.from) start.setUTCHours(0, 0, 0, 0);
  if (start > end || end.getTime() - start.getTime() > 366 * 86400000)
    throw new AppError(400, 'Choose a valid date range of at most 367 days.');
  return { start, end };
}
export async function analytics(query: { from?: string; to?: string; group?: string }) {
  const { start, end } = dateRange(query);
  const match = { createdAt: { $gte: start, $lte: end } };
  const eligible = { ...match, paymentStatus: 'Paid', orderStatus: { $ne: 'Cancelled' } };
  const unit = query.group === 'weekly' ? 'week' : query.group === 'monthly' ? 'month' : 'day';
  const [
    totals,
    orderCount,
    productCount,
    series,
    orderSeries,
    statuses,
    topProducts,
    categories,
    lowStock,
    recentOrders,
  ] = await Promise.all([
    Order.aggregate([
      { $match: eligible },
      { $group: { _id: null, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
    Order.countDocuments(match),
    Product.countDocuments({ isActive: true }),
    Order.aggregate([
      { $match: eligible },
      {
        $group: {
          _id: { $dateTrunc: { date: '$createdAt', unit, timezone: 'UTC', startOfWeek: 'monday' } },
          revenue: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateTrunc: { date: '$createdAt', unit, timezone: 'UTC', startOfWeek: 'monday' } },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([{ $match: match }, { $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: eligible },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          sku: { $first: '$items.sku' },
          units: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
        },
      },
      { $sort: { units: -1 } },
      { $limit: 5 },
    ]),
    Order.aggregate([
      { $match: eligible },
      { $unwind: '$items' },
      { $group: { _id: '$items.category', revenue: { $sum: '$items.lineTotal' } } },
      { $sort: { revenue: -1 } },
    ]),
    Product.find({ isActive: true, $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] } })
      .sort({ stockQuantity: 1 })
      .limit(5)
      .lean(),
    Order.find(match).sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  // Fill missing intervals so quiet days appear as zero rather than disappearing.
  const bucket = (date: Date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    if (unit === 'month') d.setUTCDate(1);
    if (unit === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d;
  };
  const timeline = [];
  const rev = new Map(series.map((s) => [new Date(s._id).toISOString(), s.revenue]));
  const counts = new Map(orderSeries.map((s) => [new Date(s._id).toISOString(), s.orders]));
  for (let d = bucket(start); d <= end;) {
    const key = d.toISOString();
    timeline.push({ date: key, revenue: rev.get(key) ?? 0, orders: counts.get(key) ?? 0 });
    d = new Date(d);
    if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCDate(d.getUTCDate() + (unit === 'week' ? 7 : 1));
  }
  const revenue = totals[0]?.revenue ?? 0;
  const paidOrders = totals[0]?.count ?? 0;
  return {
    range: { from: start, to: end, group: query.group ?? 'daily' },
    metrics: {
      revenue,
      orders: orderCount,
      products: productCount,
      averageOrderValue: paidOrders ? Math.round(revenue / paidOrders) : 0,
      paidOrders,
    },
    series: timeline,
    statuses,
    topProducts,
    categories,
    lowStock,
    recentOrders,
  };
}
