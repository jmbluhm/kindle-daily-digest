import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { articlesRoutes } from './articles.js';
import { tagsRoutes } from './tags.js';
import { digestRoutes } from './digest.js';
import { uiRoutes } from './ui.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check
  app.get('/healthz', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Auth routes
  await app.register(authRoutes);

  // API routes
  await app.register(articlesRoutes, { prefix: '/api' });
  await app.register(tagsRoutes, { prefix: '/api' });
  await app.register(digestRoutes, { prefix: '/api' });

  // UI routes (server-rendered HTML)
  await app.register(uiRoutes);
}
