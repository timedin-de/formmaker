import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { bearerToken, tokenHash } from '../auth.js';

/** The token used by the authenticated user; only valid on routes behind `AuthGuard`. */
export const CurrentTokenHash = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const token = bearerToken(context.switchToHttp().getRequest<Request>().headers.authorization);
    const hashed = token ? tokenHash(token) : undefined;
    if (!hashed) throw new Error('CurrentUser used on a route without AuthGuard');
    return hashed;
  },
);
