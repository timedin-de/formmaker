import { type PublicUser } from '@shared/model';
import crypto from 'node:crypto';
import { type User } from '../repository';

export function publicUser(user: User): PublicUser {
  const { id, email, role, createdAt } = user;
  return { id, email, role, createdAt };
}

/** Self-registration is off unless `ALLOW_REGISTRATION=true`; admins can always create users. */
export function registrationEnabled(): boolean {
  return process.env.ALLOW_REGISTRATION?.trim().toLowerCase() === 'true';
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

export function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
