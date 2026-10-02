import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../repository.js';

/** The authenticated user; only valid on routes behind `AuthGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User => {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw new Error('CurrentUser used on a route without AuthGuard');
    return user;
  },
);
