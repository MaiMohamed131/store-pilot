import mongoose, { Schema } from 'mongoose';
const timestamps = { timestamps: true };
export const User = mongoose.model(
  'User',
  new Schema(
    {
      name: { type: String, required: true },
      email: { type: String, required: true, unique: true, lowercase: true },
      passwordHash: { type: String, required: true, select: false },
      role: { type: String, enum: ['ADMIN', 'STAFF'], default: 'STAFF' },
      isActive: { type: Boolean, default: true },
      tokenVersion: { type: Number, default: 0, select: false },
    },
    timestamps,
  ),
);
export const Session = mongoose.model(
  'Session',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      tokenHash: { type: String, unique: true, required: true },
      usedTokenHashes: { type: [String], default: [] },
      family: { type: String, required: true },
      revokedAt: Date,
      expiresAt: { type: Date, required: true, index: { expires: 0 } },
    },
    timestamps,
  ),
);
export const Product = mongoose.model(
  'Product',
  new Schema(
    {
      name: { type: String, required: true },
      sku: { type: String, required: true, unique: true },
      description: { type: String, default: '' },
      category: { type: String, required: true },
      price: { type: Number, required: true, min: 0 },
      stockQuantity: { type: Number, required: true, min: 0 },
      lowStockThreshold: { type: Number, default: 10, min: 0 },
      imageUrl: { type: String, default: '' },
      isActive: { type: Boolean, default: true },
    },
    timestamps,
  ),
);
const itemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    category: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);
export const statuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const;
export const Order = mongoose.model(
  'Order',
  new Schema(
    {
      orderNumber: { type: String, unique: true, required: true },
      customerName: { type: String, required: true },
      customerEmail: { type: String, required: true },
      items: [itemSchema],
      subtotal: { type: Number, required: true },
      shippingAmount: { type: Number, required: true },
      totalAmount: { type: Number, required: true },
      orderStatus: { type: String, enum: statuses, default: 'Pending' },
      paymentStatus: { type: String, enum: ['Paid', 'Unpaid', 'Refunded'], required: true },
      history: [
        { from: String, to: String, actor: { type: Schema.Types.ObjectId, ref: 'User' }, at: Date },
      ],
    },
    timestamps,
  ),
);
Order.schema.index({ createdAt: -1 });
Product.schema.index({ category: 1, isActive: 1 });
export const Shop = mongoose.model(
  'Shop',
  new Schema(
    {
      key: { type: String, default: 'main', unique: true },
      name: { type: String, default: 'The Everyday Store' },
      currency: { type: String, enum: ['USD', 'EUR', 'GBP', 'EGP'], default: 'USD' },
      email: { type: String, default: '' },
      address: { type: String, default: '' },
    },
    timestamps,
  ),
);
// A shared lock serializes admin membership changes inside transactions.
export const Guard = mongoose.model(
  'Guard',
  new Schema({ _id: String, revision: { type: Number, default: 0 } }),
);
