import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config({ path: ['server/.env', '.env'], quiet: true });
export const env = z
  .object({
    DEMO_MODE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    PORT: z.coerce.number().default(4000),
    MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/storepilot'),
    CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
    JWT_SECRET: z.string().min(32),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  .parse(process.env);
