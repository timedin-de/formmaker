import crypto from 'node:crypto';

/**
 * Simple "first" access control:
 *  - `FORMMAKER_PASSWORD` (env) gates editor access via POST /api/auth/login.
 *  - The issued bearer token (in-memory) is required for editor endpoints.
 *  - Runner/share endpoints (reading a form, submitting answers) stay public.
 *
 * Offline (no server) mode accepts the same default password in the frontend.
 */
export const DEFAULT_PASSWORD = 'formmaker';

const tokens = new Set<string>();
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function login(password: string): string | null {
  if (password !== (process.env.FORMMAKER_PASSWORD ?? DEFAULT_PASSWORD)) return null;
  const token = `${crypto.randomUUID()}.${Date.now()}`;
  tokens.add(token);
  setTimeout(() => tokens.delete(token), TOKEN_TTL_MS);
  return token;
}

export function isEditorToken(token: string | undefined): boolean {
  return !!token && tokens.has(token);
}

export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? undefined;
}

/** Reset the token store (used in tests). */
export function resetTokens(): void {
  tokens.clear();
}
