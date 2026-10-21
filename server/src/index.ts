import mongoose from 'mongoose';
import { env } from './config/env.js';
import { app } from './app.js';
await mongoose.connect(env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  autoCreate: false,
  autoIndex: false,
});
const server = app.listen(env.PORT, () =>
  console.log(`StorePilot API listening on http://localhost:${env.PORT}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      void mongoose.disconnect().then(() => process.exit(0));
    }),
  );
