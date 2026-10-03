import type { RequestHandler } from 'express';
import crypto from 'node:crypto';
import { PublicUser, UserRole } from '../shared/model/user.model.js';
import type { Repository, User } from './repository.js';

export const DEFAULT_PASSWORD = 'formmaker';

export function publicUser(user: User): PublicUser {
  const { id, email, role, createdAt } = user;
  return { id, email, role, createdAt };
}

// TODO ADMIN CREDS
export async function ensureInitialAdmin(repository: Repository): Promise<void> {
  if ((await repository.users()).length > 0) return;
  const email = (process.env.FORMMAKER_ADMIN_EMAIL ?? 'admin@formmaker.local').toLowerCase();
  await repository.createUser({
    id: crypto.randomUUID(),
    email,
    passwordHash: await hashPassword(process.env.FORMMAKER_PASSWORD ?? DEFAULT_PASSWORD),
    role: 'admin',
    createdAt: new Date().toISOString(),
  });
}

export function authenticate(repository: Repository): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = bearerToken(req.headers.authorization);
      const user = token ? await repository.userBySession(tokenHash(token)) : null;
      if (!user) {
        res.status(401).json({ error: 'authentication required' });
        return;
      }
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'insufficient permissions' });
      return;
    }
    next();
  };
}

export function bearerToken(header: string | undefined): string | undefined {
  if (!header || typeof header !== 'string') {
    return;
  }
  const parts = header.trim().split(' ');

  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    const token = parts[1].trim();
    return token;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('base64url');
  const derived = await scrypt(password, salt);
  return `scrypt$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = await scrypt(password, salt);
  const expectedBytes = Buffer.from(expected, 'base64url');
  return expectedBytes.length === actual.length && crypto.timingSafeEqual(expectedBytes, actual);
}

function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export { tokenHash };

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
