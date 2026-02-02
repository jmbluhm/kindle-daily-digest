import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { getDb, disconnectDb } from '@kindle-assist/core';
import { registerRoutes } from './routes/index.js';
import { env } from './env.js';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'info' : 'warn',
  },
});

// Register plugins
await app.register(cookie, {
  secret: env.SESSION_SECRET,
  hook: 'onRequest',
});

await app.register(formbody);

// Add database to request
app.decorateRequest('db', { getter: () => getDb() });

// Register routes
await registerRoutes(app);

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    await disconnectDb();
    process.exit(0);
  });
}

// Start server
try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  app.log.info(`Server running on http://0.0.0.0:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyRequest {
    db: ReturnType<typeof getDb>;
  }
}
