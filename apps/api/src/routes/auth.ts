import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'crypto';
import { loginPage } from '../views/login.js';
import { setSessionCookie, clearSessionCookie, getSessionUserId } from '../middleware/auth.js';
import { env } from '../env.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Login page
  app.get('/login', async (request, reply) => {
    // If already logged in, redirect to home
    if (getSessionUserId(request)) {
      return reply.redirect('/');
    }

    reply.type('text/html').send(loginPage());
  });

  // Login form submission
  app.post<{ Body: { password: string } }>('/login', async (request, reply) => {
    const { password } = request.body;

    // Timing-safe password comparison
    const passwordBuffer = Buffer.from(password);
    const expectedBuffer = Buffer.from(env.ADMIN_PASSWORD);

    const isValid =
      passwordBuffer.length === expectedBuffer.length &&
      timingSafeEqual(passwordBuffer, expectedBuffer);

    if (!isValid) {
      reply.type('text/html').send(loginPage('Invalid password'));
      return;
    }

    // Get or create admin user
    let user = await request.db.user.findFirst();
    if (!user) {
      user = await request.db.user.create({
        data: { email: 'admin@kindle-assist.local' },
      });
    }

    // Set session cookie
    setSessionCookie(reply, user.id);

    reply.redirect('/');
  });

  // Logout
  app.post('/logout', async (request, reply) => {
    clearSessionCookie(reply);
    reply.redirect('/login');
  });
}
