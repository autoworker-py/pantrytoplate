import 'fastify';
import '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler that rejects unauthenticated requests */
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /** id of the authenticated user; only present behind `authenticate` */
    userId: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
  }
}
