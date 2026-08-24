import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { changePassword, registerUser, verifyCredentials } from '../services/auth.js';

const credentials = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

const routes: FastifyPluginAsync = async (app) => {
  app.post('/register', async (request, reply) => {
    const { email, password } = credentials.parse(request.body);
    const user = await registerUser(email, password);
    const token = app.jwt.sign({ sub: user.id, email: user.email });
    return reply.code(201).send({ token, user });
  });

  app.post('/login', async (request) => {
    const { email, password } = credentials.parse(request.body);
    const user = await verifyCredentials(email, password);
    return { token: app.jwt.sign({ sub: user.id, email: user.email }), user };
  });

  app.post('/password', { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        currentPassword: z.string().min(1, 'Enter your current password.'),
        newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
      })
      .parse(request.body);
    return changePassword(request.userId, body.currentPassword, body.newPassword);
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => ({
    user: { id: request.user.sub, email: request.user.email },
  }));
};

export default routes;
