import mongoose from 'mongoose';
import { Order, Product, statuses } from '../models/index.js';
import { AppError, type Actor } from '../middleware/security.js';
import { withTransaction } from './database.js';
export const transitions: Record<string, string[]> = {
  Pending: ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered'],
  Delivered: [],
  Cancelled: [],
};
export function allowedTransitions(status: string, role: string) {
  return (transitions[status] ?? []).filter((s) => role === 'ADMIN' || s !== 'Cancelled');
}
export function calculateTotals(
  items: { quantity: number; unitPrice: number }[],
  shipping: number,
) {
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
    throw new AppError(400, 'Invalid order amounts.');
  const subtotal = items.reduce((n, i) => n + i.quantity * i.unitPrice, 0);
  if (!Number.isSafeInteger(subtotal + shipping))
    throw new AppError(400, 'Order amount is too large.');
  return { subtotal, totalAmount: subtotal + shipping };
}
export function recognizesRevenue(order: { paymentStatus: string; orderStatus: string }) {
  return order.paymentStatus === 'Paid' && order.orderStatus !== 'Cancelled';
}
export async function changeStatus(id: string, status: (typeof statuses)[number], actor: Actor) {
  if (status !== 'Cancelled') {
    const order = await Order.findById(id);
    if (!order) throw new AppError(404, 'Order not found.');
    if (!allowedTransitions(order.orderStatus!, actor.role).includes(status))
      throw new AppError(409, 'This order status transition is not permitted.');
    const updated = await Order.findOneAndUpdate(
      { _id: id, orderStatus: order.orderStatus },
      {
        $set: { orderStatus: status },
        $push: {
          history: {
            from: order.orderStatus,
            to: status,
            actor: new mongoose.Types.ObjectId(actor.id),
            at: new Date(),
          },
        },
      },
      { new: true, runValidators: true },
    );
    if (!updated) throw new AppError(409, 'The order changed. Refresh and try again.');
    return updated;
  }
  return withTransaction(async (session) => {
    const order = await Order.findById(id).session(session);
    if (!order) throw new AppError(404, 'Order not found.');
    if (!allowedTransitions(order.orderStatus!, actor.role).includes(status))
      throw new AppError(409, 'This order status transition is not permitted.');
    const from = order.orderStatus;
    order.orderStatus = status;
    order.history.push({
      from,
      to: status,
      actor: new mongoose.Types.ObjectId(actor.id),
      at: new Date(),
    });
    // Stock is deducted at creation. Cancellation restores it exactly once in this transaction.
    if (status === 'Cancelled') {
      for (const item of order.items)
        await Product.updateOne(
          { _id: item.product },
          { $inc: { stockQuantity: item.quantity } },
          { session },
        );
      if (order.paymentStatus === 'Paid') order.paymentStatus = 'Refunded';
    }
    await order.save({ session });
    return order;
  });
}
