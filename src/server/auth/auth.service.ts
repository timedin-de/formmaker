import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import crypto from 'node:crypto';
import type { PublicUser } from '../../shared/model/user.model.js';
import { hashPassword, login, logout } from '../auth.js';
import { Repository } from '../repository.js';

export interface AuthResult {
  token: string;
  user: PublicUser;
}

/** Thin wrapper over the session helpers in `../auth.ts` (shared with the legacy routers). */
@Injectable()
export class AuthService {
  constructor(@Inject(Repository) private readonly repository: Repository) {}

  async login(email: string, password: string): Promise<AuthResult> {
    const result = await login(this.repository, email, password);
    if (!result) throw new UnauthorizedException({ error: 'invalid credentials' });
    return result;
  }

  async register(rawEmail: string, password: string): Promise<AuthResult> {
    const email = rawEmail.toLowerCase();
    if (await this.repository.userByEmail(email)) {
      throw new ConflictException({ error: 'email already exists' });
    }
    await this.repository.createUser({
      id: crypto.randomUUID(),
      email,
      passwordHash: await hashPassword(password),
      role: 'editor',
      createdAt: new Date().toISOString(),
    });
    return this.login(email, password);
  }

  logout(req: Request): Promise<void> {
    return logout(this.repository, req);
  }
}
