import { describe, it, expect } from 'vitest';
import { buildDemoData, validateDemoData } from '../services/demo-data.js';
const anchor = new Date('2026-10-20T12:00:00.000Z');
describe('Standalone historical demo import plan', () => {
  it('creates a diverse catalog and realistic status/payment history with fixed identifiers', () => {
    const plan = buildDemoData(anchor);
    expect(plan.products).toHaveLength(40);
    expect(plan.orders).toHaveLength(240);
    expect(new Set(plan.products.map((p) => p.category)).size).toBe(5);
    expect(new Set(plan.products.map((p) => String(p._id))).size).toBe(40);
    expect(new Set(plan.orders.map((o) => o.orderNumber)).size).toBe(240);
    expect(new Set(plan.orders.map((o) => o.orderStatus)).size).toBe(5);
    expect(plan.orders.every((o) => o.createdAt <= anchor)).toBe(true);
    expect(
      Math.max(...plan.orders.map((o) => +o.createdAt)) -
        Math.min(...plan.orders.map((o) => +o.createdAt)),
    ).toBeGreaterThan(88 * 86400000);
    expect(
      plan.orders
        .filter((o) => o.orderStatus === 'Delivered')
        .every((o) => o.paymentStatus === 'Paid'),
    ).toBe(true);
    expect(plan.products.some((p) => p.stockQuantity === 0)).toBe(true);
  });
  it('preserves the same plan and historical snapshots across reruns', () => {
    const first = buildDemoData(anchor);
    expect(buildDemoData(anchor)).toEqual(first);
    const before = first.orders[0].items[0].unitPrice;
    first.products[0].price = 99999;
    expect(first.orders[0].items[0].unitPrice).toBe(before);
  });
  it('reconciles exact minor-unit totals, revenue eligibility, and opening/closing stock', () => {
    const plan = buildDemoData(anchor);
    const validation = validateDemoData(plan);
    const independentRevenue = plan.orders.reduce(
      (sum, o) =>
        sum +
        (o.paymentStatus === 'Paid' && o.orderStatus !== 'Cancelled'
          ? o.items.reduce((n, i) => n + i.quantity * i.unitPrice, 0) + o.shippingAmount
          : 0),
      0,
    );
    expect(validation.revenue).toBe(independentRevenue);
    expect(validation.revenue).toBeGreaterThan(0);
    for (const product of plan.products) {
      const consumed = plan.orders
        .filter((o) => o.orderStatus !== 'Cancelled')
        .flatMap((o) => o.items)
        .filter((i) => i.product.equals(product._id))
        .reduce((sum, i) => sum + i.quantity, 0);
      expect(validation.openingStock.find((s) => s.sku === product.sku)!.opening - consumed).toBe(
        product.stockQuantity,
      );
    }
  });
  it('rejects inconsistent financial data before any database writes', () => {
    const plan = buildDemoData(anchor);
    plan.orders[0].totalAmount++;
    expect(() => validateDemoData(plan)).toThrow('Invalid totals');
  });
});
