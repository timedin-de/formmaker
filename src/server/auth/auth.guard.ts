import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { bearerToken, tokenHash } from '../auth.js';
import { Repository } from '../repository.js';

/** Requires a valid session token and exposes the user as `req.user`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Repository) private readonly repository: Repository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await hasAuth(context, this.repository)))
      throw new UnauthorizedException({ error: 'authentication required' });
    return true;
  }
}

/** Requires a valid session token as admin account and exposes the user as `req.user`. */
export class AdminGuard implements CanActivate {
  constructor(@Inject(Repository) private readonly repository: Repository) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = await hasAuth(context, this.repository);
    if (user.role !== 'admin') throw new ForbiddenException({ error: 'insufficient permission' });
    return true;
  }
}

async function hasAuth(context: ExecutionContext, repository: Repository) {
  const req = context.switchToHttp().getRequest<Request>();
  const token = bearerToken(req.headers.authorization);
  const user = token ? await repository.userBySession(tokenHash(token)) : null;
  if (!user) throw new UnauthorizedException({ error: 'authentication required' });
  req.user = user;
  return user;
}
