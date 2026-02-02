import type { FastifyInstance } from 'fastify';
import { requireSession } from '../middleware/auth.js';
import { articlesPage } from '../views/articles.js';
import { tagsPage } from '../views/tags.js';
import { extractArticle } from '@kindle-assist/core';

export async function uiRoutes(app: FastifyInstance): Promise<void> {
  // Home / Articles list
  app.get<{
    Querystring: {
      status?: 'INBOX' | 'ARCHIVED';
      tag?: string;
      message?: string;
    };
  }>('/', { preHandler: requireSession }, async (request, reply) => {
    const { status = 'INBOX', tag, message } = request.query;
    const userId = request.userId!;

    const [articles, tags] = await Promise.all([
      request.db.article.findMany({
        where: {
          userId,
          status,
          ...(tag && {
            tags: { some: { tag: { name: tag } } },
          }),
        },
        include: {
          tags: { include: { tag: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      request.db.tag.findMany({ orderBy: { name: 'asc' } }),
    ]);

    reply.type('text/html').send(articlesPage(articles, status, tags, tag, message));
  });

  // Tags page
  app.get<{ Querystring: { message?: string } }>(
    '/tags',
    { preHandler: requireSession },
    async (request, reply) => {
      const { message } = request.query;

      const tags = await request.db.tag.findMany({
        include: {
          _count: { select: { articles: true } },
        },
        orderBy: { name: 'asc' },
      });

      reply.type('text/html').send(tagsPage(tags, message));
    }
  );

  // Add article (form submission)
  app.post<{ Body: { url: string; tags?: string } }>(
    '/articles',
    { preHandler: requireSession },
    async (request, reply) => {
      const { url, tags: tagsString } = request.body;
      const userId = request.userId!;

      try {
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
          return reply.redirect('/?message=' + encodeURIComponent('Article already saved'));
        }

        // Parse tags
        const tagNames = tagsString
          ? tagsString
              .split(',')
              .map((t) => t.toLowerCase().trim())
              .filter((t) => t.length > 0)
          : [];

        // Create article
        await request.db.article.create({
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
            tags:
              tagNames.length > 0
                ? {
                    create: await Promise.all(
                      tagNames.map(async (tagName) => {
                        const tag = await request.db.tag.upsert({
                          where: { name: tagName },
                          create: { name: tagName },
                          update: {},
                        });
                        return { tagId: tag.id };
                      })
                    ),
                  }
                : undefined,
          },
        });

        return reply.redirect('/?message=' + encodeURIComponent('Article saved!'));
      } catch (error) {
        request.log.error(error, 'Failed to save article');
        return reply.redirect(
          '/?message=' + encodeURIComponent('Failed to save article: ' + (error instanceof Error ? error.message : 'Unknown error'))
        );
      }
    }
  );

  // Archive article (form submission)
  app.post<{ Params: { id: string } }>(
    '/articles/:id/archive',
    { preHandler: requireSession },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId!;

      await request.db.article.updateMany({
        where: { id, userId },
        data: { status: 'ARCHIVED' },
      });

      return reply.redirect('/?message=' + encodeURIComponent('Article archived'));
    }
  );

  // Unarchive article (form submission)
  app.post<{ Params: { id: string } }>(
    '/articles/:id/unarchive',
    { preHandler: requireSession },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId!;

      await request.db.article.updateMany({
        where: { id, userId },
        data: { status: 'INBOX' },
      });

      return reply.redirect('/?status=ARCHIVED&message=' + encodeURIComponent('Article moved to inbox'));
    }
  );

  // Favorite article (form submission)
  app.post<{ Params: { id: string } }>(
    '/articles/:id/favorite',
    { preHandler: requireSession },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId!;

      await request.db.article.updateMany({
        where: { id, userId },
        data: { favorited: true },
      });

      return reply.redirect(request.headers.referer || '/');
    }
  );

  // Unfavorite article (form submission)
  app.post<{ Params: { id: string } }>(
    '/articles/:id/unfavorite',
    { preHandler: requireSession },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId!;

      await request.db.article.updateMany({
        where: { id, userId },
        data: { favorited: false },
      });

      return reply.redirect(request.headers.referer || '/');
    }
  );

  // Send to Kindle (form submission)
  app.post<{ Params: { id: string } }>(
    '/articles/:id/send-to-kindle',
    { preHandler: requireSession },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId!;

      const article = await request.db.article.findFirst({
        where: { id, userId },
      });

      if (!article) {
        return reply.redirect('/?message=' + encodeURIComponent('Article not found'));
      }

      try {
        const { generateEpub, generateDigestFilename, sendDigestToKindle } = await import(
          '@kindle-assist/core'
        );

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
        await sendDigestToKindle(epub, filename, 1, now);

        await request.db.article.update({
          where: { id },
          data: { sentToKindleAt: now },
        });

        return reply.redirect('/?message=' + encodeURIComponent('Sent to Kindle!'));
      } catch (error) {
        request.log.error(error, 'Failed to send to Kindle');
        return reply.redirect(
          '/?message=' + encodeURIComponent('Failed to send to Kindle: ' + (error instanceof Error ? error.message : 'Unknown error'))
        );
      }
    }
  );

  // Create tag (form submission)
  app.post<{ Body: { name: string } }>(
    '/tags',
    { preHandler: requireSession },
    async (request, reply) => {
      const { name } = request.body;
      const normalizedName = name.toLowerCase().trim();

      if (!normalizedName) {
        return reply.redirect('/tags?message=' + encodeURIComponent('Tag name is required'));
      }

      const existing = await request.db.tag.findUnique({
        where: { name: normalizedName },
      });

      if (existing) {
        return reply.redirect('/tags?message=' + encodeURIComponent('Tag already exists'));
      }

      await request.db.tag.create({
        data: { name: normalizedName },
      });

      return reply.redirect('/tags?message=' + encodeURIComponent('Tag created!'));
    }
  );
}
