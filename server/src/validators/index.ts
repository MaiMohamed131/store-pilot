import { z } from 'zod';
import { statuses } from '../models/index.js';
const money = z.number().int().min(0).max(100000000);
export const productInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    sku: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Za-z0-9-]+$/),
    description: z.string().max(2000).default(''),
    category: z.string().trim().min(2).max(60),
    price: money,
    stockQuantity: z.number().int().min(0).max(1000000),
    lowStockThreshold: z.number().int().min(0).max(1000000),
    imageUrl: z
      .union([z.literal(''), z.url().refine((s) => s.startsWith('https://'), 'Use an HTTPS URL')])
      .default(''),
    isActive: z.boolean().default(true),
  })
  .strict();
export const loginInput = z
  .object({ email: z.email().toLowerCase(), password: z.string().min(1).max(128) })
  .strict();
export const userInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.email().toLowerCase(),
    password: z.string().min(12).max(128),
    role: z.enum(['ADMIN', 'STAFF']).default('STAFF'),
  })
  .strict();
export const userPatch = userInput
  .omit({ password: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();
export const statusInput = z.object({ status: z.enum(statuses) }).strict();
export const profileInput = z
  .object({ name: z.string().trim().min(2).max(100), email: z.email().toLowerCase() })
  .strict();
export const passwordInput = z
  .object({ currentPassword: z.string().min(1).max(128), password: z.string().min(12).max(128) })
  .strict();
export const shopInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    currency: z.enum(['USD', 'EUR', 'GBP', 'EGP']),
    email: z.union([z.email(), z.literal('')]),
    address: z.string().max(300),
  })
  .strict();
export const listInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().max(100).default(''),
  sort: z.string().default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  category: z.string().max(60).optional(),
  stock: z.enum(['low', 'out', 'healthy']).optional(),
  status: z.enum(statuses).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
});
export const rangeInput = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  group: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
});
