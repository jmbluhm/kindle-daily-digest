import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';

export async function tagsRoutes(app: FastifyInstance): Promise<void> {
  // List tags
  app.get('/tags', { preHandler: requireAuth }, async (request) => {
    const tags = await request.db.tag.findMany({
      include: {
        _count: {
          select: { articles: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return { tags };
  });

  // Create tag
  app.post<{ Body: { name: string } }>(
    '/tags',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { name } = request.body;
      const normalizedName = name.toLowerCase().trim();

      if (!normalizedName) {
        return reply.status(400).send({ error: 'Tag name is required' });
      }

      const existing = await request.db.tag.findUnique({
        where: { name: normalizedName },
      });

      if (existing) {
        return reply.status(409).send({ error: 'Tag already exists', tag: existing });
      }

      const tag = await request.db.tag.create({
        data: { name: normalizedName },
      });

      return reply.status(201).send(tag);
    }
  );
}
