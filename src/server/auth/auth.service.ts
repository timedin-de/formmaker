import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { uuid } from '@shared/model/ids.js';
import crypto from 'node:crypto';
import type { PublicUser, UserRole } from '../../shared/model/user.model.js';
import { hashPassword, publicUser, tokenHash, verifyPassword } from '../auth.js';
import { Repository, User } from '../repository.js';

export interface AuthResult {
  token: string;
  user: PublicUser;
}
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Thin wrapper over the session helpers in `../auth.ts` (shared with the legacy routers). */
@Injectable()
export class AuthService {
  constructor(@Inject(Repository) private readonly repository: Repository) {}

  async login(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.repository.userByEmail(normalizedEmail);
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      throw new UnauthorizedException({ error: 'invalid credentials' });

    await this.repository.pruneSessions();
    const token = crypto.randomBytes(32).toString('base64url');
    await this.repository.createSession(
      tokenHash(token),
      user.id,
      new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    );
    return { token, user: publicUser(user) };
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

  async logout(tokenHash: string): Promise<void> {
    await this.repository.deleteSession(tokenHash);
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

  async ensureInitialAdmin(): Promise<void> {
    if ((await this.repository.users()).length > 0) return;
    const email = (process.env.FORMMAKER_ADMIN_EMAIL ?? 'admin@formmaker.local').toLowerCase();

    let password = process.env.FORMMAKER_PASSWORD;

    if (!password || (password?.length ?? 0) < 8) {
      console.warn('No or to short password for initial admin provided, generating random:');
      password = crypto.randomUUID();
      console.log(password);
    }
    await this.repository.createUser({
      id: uuid(),
      email,
      passwordHash: await hashPassword(password),
      role: 'admin',
      createdAt: new Date().toISOString(),
    });
  }
}
