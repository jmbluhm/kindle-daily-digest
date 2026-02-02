import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';

export async function digestRoutes(app: FastifyInstance): Promise<void> {
  // Trigger digest run manually
  app.post('/digest/run', { preHandler: requireAuth }, async (request, reply) => {
    // This endpoint allows triggering the digest manually via API
    // The actual digest logic is in the cron runner
    // Here we just record the request to run it

    const userId = request.userId!;

    // Check if there's already a digest run in progress today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingRun = await request.db.digestRun.findFirst({
      where: {
        userId,
        startedAt: { gte: today },
        status: 'SUCCESS',
      },
    });

    if (existingRun) {
      return reply.status(409).send({
        error: 'Digest already run today',
        lastRun: existingRun,
      });
    }

    // For API-triggered runs, we'll note this is a placeholder
    // The actual digest should be triggered via the cron endpoint or CLI
    return {
      message: 'Use pnpm cron:run to trigger the digest, or deploy the cron service',
    };
  });

  // List digest runs
  app.get<{
    Querystring: { limit?: string };
  }>('/digest/runs', { preHandler: requireAuth }, async (request) => {
    const { limit = '20' } = request.query;
    const userId = request.userId!;

    const runs = await request.db.digestRun.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: parseInt(limit, 10),
    });

    return { runs };
  });
}
