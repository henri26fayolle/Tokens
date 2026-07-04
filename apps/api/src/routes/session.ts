import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from '../auth';

export interface SessionUser {
  id: string;
  handle: string;
}

function headersFrom(request: FastifyRequest): Headers {
  const headers = new Headers();
  if (request.headers.cookie) headers.set('cookie', String(request.headers.cookie));
  return headers;
}

/** 401s when there is no session. */
export function makeRequireUser(auth: Auth) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<SessionUser | null> => {
    const session = await auth.api.getSession({ headers: headersFrom(request) });
    if (!session) {
      await reply.code(401).send({ error: 'unauthorized' });
      return null;
    }
    return session.user as unknown as SessionUser;
  };
}

/** Null when logged out — for public endpoints that personalize when possible. */
export function makeOptionalUser(auth: Auth) {
  return async (request: FastifyRequest): Promise<SessionUser | null> => {
    const session = await auth.api.getSession({ headers: headersFrom(request) });
    return session ? (session.user as unknown as SessionUser) : null;
  };
}
