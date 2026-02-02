import type { FastifyInstance } from 'fastify';
import {
  extractArticle,
  generateEpub,
  generateDigestFilename,
  sendDigestToKindle,
} from '@kindle-assist/core';
import { requireAuth } from '../middleware/auth.js';

export async function articlesRoutes(app: FastifyInstance): Promise<void> {
  // Create article
  app.post<{
    Body: { url: string; tags?: string[] };
  }>('/articles', { preHandler: requireAuth }, async (request, reply) => {
    const { url, tags } = request.body;
    const userId = request.userId!;

    try {
      // Extract article content
      const extracted = await extractArticle(url);

      // Check for duplicate
      const existing = await request.db.article.findUnique({
        where: {
          userId_contentHash: {
            userId,
            contentHash: extracted.contentHash,
          },
        },
      });

      if (existing) {
        return reply.status(409).send({
          error: 'Article already exists',
          articleId: existing.id,
        });
      }

      // Create article
      const article = await request.db.article.create({
        data: {
          userId,
          url,
          canonicalUrl: extracted.canonicalUrl,
          title: extracted.title,
          author: extracted.author,
          siteName: extracted.siteName,
          publishedAt: extracted.publishedAt,
          excerpt: extracted.excerpt,
          contentHtml: extracted.contentHtml,
          contentText: extracted.contentText,
          wordCount: extracted.wordCount,
          readingMinutes: extracted.readingMinutes,
          contentHash: extracted.contentHash,
          tags: tags?.length
            ? {
                create: await Promise.all(
                  tags.map(async (tagName) => {
                    const tag = await request.db.tag.upsert({
                      where: { name: tagName.toLowerCase().trim() },
                      create: { name: tagName.toLowerCase().trim() },
                      update: {},
                    });
                    return { tagId: tag.id };
                  })
                ),
              }
            : undefined,
        },
        include: {
          tags: { include: { tag: true } },
        },
      });

      return reply.status(201).send(article);
    } catch (error) {
      request.log.error(error, 'Failed to extract article');
      return reply.status(400).send({
        error: 'Failed to extract article content',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // List articles
  app.get<{
    Querystring: {
      status?: 'INBOX' | 'ARCHIVED';
      tag?: string;
      q?: string;
      limit?: string;
      cursor?: string;
    };
  }>('/articles', { preHandler: requireAuth }, async (request) => {
    const { status = 'INBOX', tag, q, limit = '50', cursor } = request.query;
    const userId = request.userId!;

    const where = {
      userId,
      status,
      ...(tag && {
        tags: {
          some: {
            tag: { name: tag },
          },
        },
      }),
      ...(q && {
        OR: [
          { title: { contains: q, mode: 'insensitive' as const } },
          { contentText: { contains: q, mode: 'insensitive' as const } },
        ],
      }),
    };

    const articles = await request.db.article.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    return {
      articles,
      nextCursor: articles.length === parseInt(limit, 10) ? articles[articles.length - 1]?.id : null,
    };
  });

  // Archive article
  app.post<{ Params: { id: string } }>(
    '/articles/:id/archive',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId!;

      const article = await request.db.article.updateMany({
        where: { id, userId },
        data: { status: 'ARCHIVED' },
      });

      if (article.count === 0) {
        return reply.status(404).send({ error: 'Article not found' });
      }

      return { success: true };
    }
  );

  // Unarchive article
  app.post<{ Params: { id: string } }>(
    '/articles/:id/unarchive',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId!;

      const article = await request.db.article.updateMany({
        where: { id, userId },
        data: { status: 'INBOX' },
      });

      if (article.count === 0) {
        return reply.status(404).send({ error: 'Article not found' });
      }

      return { success: true };
    }
  );

  // Favorite article
  app.post<{ Params: { id: string } }>(
    '/articles/:id/favorite',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId!;

      const article = await request.db.article.updateMany({
        where: { id, userId },
        data: { favorited: true },
      });

      if (article.count === 0) {
        return reply.status(404).send({ error: 'Article not found' });
      }

      return { success: true };
    }
  );

  // Unfavorite article
  app.post<{ Params: { id: string } }>(
    '/articles/:id/unfavorite',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId!;

      const article = await request.db.article.updateMany({
        where: { id, userId },
        data: { favorited: false },
      });

      if (article.count === 0) {
        return reply.status(404).send({ error: 'Article not found' });
      }

      return { success: true };
    }
  );

  // Send single article to Kindle
  app.post<{ Params: { id: string } }>(
    '/articles/:id/send-to-kindle-now',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId!;

      const article = await request.db.article.findFirst({
        where: { id, userId },
      });

      if (!article) {
        return reply.status(404).send({ error: 'Article not found' });
      }

      try {
        const now = new Date();
        const epub = await generateEpub({
          title: article.title,
          date: now,
          articles: [
            {
              title: article.title,
              author: article.author,
              siteName: article.siteName,
              url: article.url,
              contentHtml: article.contentHtml,
              readingMinutes: article.readingMinutes,
            },
          ],
        });

        const filename = generateDigestFilename(now);
        const result = await sendDigestToKindle(epub, filename, 1, now);

        // Mark as sent
        await request.db.article.update({
          where: { id },
          data: { sentToKindleAt: now },
        });

        return {
          success: true,
          messageId: result.messageId,
        };
      } catch (error) {
        request.log.error(error, 'Failed to send to Kindle');
        return reply.status(500).send({
          error: 'Failed to send to Kindle',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
