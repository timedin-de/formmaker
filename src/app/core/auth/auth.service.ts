import { Injectable, inject, signal } from '@angular/core';
import { FormsRepository } from '../state/forms.repository';

const TOKEN_KEY = 'formmaker.token';

/**
 * Offline fallback password. Keep in sync with `DEFAULT_PASSWORD` in
 * server/auth.ts — it is only accepted when the API is unreachable.
 */
const OFFLINE_PASSWORD = 'formmaker';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly authenticated = signal<boolean>(!!readToken());

  readonly repo = inject(FormsRepository);

  token(): string | null {
    return readToken();
  }

  /**
   * Validate the editor password. Online it is checked against the server
   * (FORMMAKER_PASSWORD). When the API is unreachable the same default
   * password is accepted so the app stays usable offline.
   */
  async login(password: string): Promise<boolean> {
    if (!this.repo.offline()) {
      try {
        const token = await requestLogin(password);
        if (token) {
          writeToken(token);
          this.authenticated.set(true);
          return true;
        }
      } catch {
        /* server unreachable — fall through to offline check */
      }
    }
    if (password === OFFLINE_PASSWORD) {
      writeToken('offline');
      this.authenticated.set(true);
      return true;
    }
    return false;
  }

  logout(): void {
    clearToken();
    this.authenticated.set(false);
  }
}

async function requestLogin(password: string): Promise<string | null> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { token?: string };
  return body.token ?? null;
}

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}
