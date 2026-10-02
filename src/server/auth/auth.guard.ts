import {
  type CanActivate,
  type ExecutionContext,
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
    const req = context.switchToHttp().getRequest<Request>();
    const token = bearerToken(req.headers.authorization);
    const user = token ? await this.repository.userBySession(tokenHash(token)) : null;
    if (!user) throw new UnauthorizedException({ error: 'authentication required' });
    req.user = user;
    return true;
  }
}
