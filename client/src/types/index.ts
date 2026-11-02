export interface User {
  isDemo?: boolean;
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
  isActive?: boolean;
  createdAt?: string;
}
export interface Product {
  _id: string;
  name: string;
  sku: string;
  description: string;
  category: string;
  price: number;
  stockQuantity: number;
  lowStockThreshold: number;
  imageUrl: string;
  isActive: boolean;
  createdAt: string;
}
export type Status = 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
export interface Order {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  items: {
    product: string;
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
  createdAt: string;
  history: { from: string; to: string; actor: { name: string } | null; at: string }[];
}
export interface Shop {
  name: string;
  currency: string;
  email: string;
  address: string;
}
export interface List<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; categories?: string[] };
}
export interface Analytics {
  metrics: {
    revenue: number;
    orders: number;
    products: number;
    averageOrderValue: number;
    paidOrders: number;
  };
  series: { date: string; revenue: number; orders: number }[];
  statuses: { _id: Status; count: number }[];
  topProducts: { _id: string; name: string; sku: string; units: number; revenue: number }[];
  categories: { _id: string; revenue: number }[];
  lowStock: Product[];
  recentOrders: Order[];
}
