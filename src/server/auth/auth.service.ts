import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import crypto from 'node:crypto';
import type { PublicUser, UserRole } from '../../shared/model/user.model.js';
import { hashPassword, login, logout, verifyPassword } from '../auth.js';
import { Repository, User } from '../repository.js';

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

  async register(rawEmail: string, password: string, role: UserRole = 'editor') {
    const email = rawEmail.toLowerCase();
    if (await this.repository.userByEmail(email)) {
      throw new ConflictException({ error: 'email already exists' });
    }
    return await this.repository.createUser({
      id: crypto.randomUUID(),
      email,
      passwordHash: await hashPassword(password),
      role,
      createdAt: new Date().toISOString(),
    });
  }

  logout(req: Request): Promise<void> {
    return logout(this.repository, req);
  }

  /**
   * Method for the user to change his own password
   */
  async changePassword(user: User, currentPassword: string, newPassword: string, token: string) {
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new ForbiddenException({ error: 'invalid password' });
    }
    return await this.updatePassword(user, newPassword, token);
  }

  async changeEmail(user: User, currentPassword: string, email: string) {
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new ForbiddenException({ error: 'invalid password' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await this.repository.userByEmail(normalizedEmail);
    if (existingUser && existingUser.id !== user.id) {
      throw new ConflictException({ error: 'email already exists' });
    }
    return await this.repository.updateUserEmail(user.id, normalizedEmail);
  }

  /**
   * Admin/Internal method to change users password
   */
  async updatePassword(user: User, newPassword: string, token?: string) {
    await this.repository.clearUsersSessions(user.id, token);

    await this.repository.updateUserPassword(user.id, await hashPassword(newPassword));
  }
}
