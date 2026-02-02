import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../env.js';

const SESSION_COOKIE_NAME = 'kindle_assist_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function signSession(userId: string): string {
  const data = JSON.stringify({ userId, exp: Date.now() + SESSION_MAX_AGE });
  const signature = createHmac('sha256', env.SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `${Buffer.from(data).toString('base64url')}.${signature}`;
}

function verifySession(token: string): { userId: string } | null {
  try {
    const [dataB64, signature] = token.split('.');
    if (!dataB64 || !signature) return null;

    const data = Buffer.from(dataB64, 'base64url').toString();
    const expectedSig = createHmac('sha256', env.SESSION_SECRET)
      .update(data)
      .digest('base64url');

    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const parsed = JSON.parse(data);
    if (parsed.exp < Date.now()) {
      return null;
    }

    return { userId: parsed.userId };
  } catch {
    return null;
  }
}

export function setSessionCookie(reply: FastifyReply, userId: string): void {
  const token = signSession(userId);
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE / 1000, // seconds
    path: '/',
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
  });
}

export function getSessionUserId(request: FastifyRequest): string | null {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const session = verifySession(token);
  return session?.userId || null;
}

export async function requireApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey || apiKey !== env.ADMIN_API_KEY) {
    reply.status(401).send({ error: 'Invalid or missing API key' });
    return;
  }
}

export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = getSessionUserId(request);

  if (!userId) {
    // For UI routes, redirect to login
    if (request.headers.accept?.includes('text/html')) {
      reply.redirect('/login');
      return;
    }
    reply.status(401).send({ error: 'Not authenticated' });
    return;
  }

  // Add userId to request for use in handlers
  request.userId = userId;
}

// Allows either API key or session
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'];

  if (apiKey === env.ADMIN_API_KEY) {
    // API key auth - get admin user
    const user = await request.db.user.findFirst();
    if (user) {
      request.userId = user.id;
    }
    return;
  }

  const userId = getSessionUserId(request);
  if (userId) {
    request.userId = userId;
    return;
  }

  if (request.headers.accept?.includes('text/html')) {
    reply.redirect('/login');
    return;
  }
  reply.status(401).send({ error: 'Not authenticated' });
}

// Type augmentation
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}
