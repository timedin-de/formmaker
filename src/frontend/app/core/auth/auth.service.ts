import { Injectable, signal } from '@angular/core';
import { clearApiCache } from '../state/api-cache';
import { catchFn } from '@shared/helper';

const TOKEN_KEY = 'formmaker.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly authenticated = signal<boolean>(!!readToken());

  token(): string | null {
    return readToken();
  }

  /** Validate editor credentials against the server. */
  async login(password: string, email?: string): Promise<boolean> {
    let token: string | null;
    try {
      token = await requestLogin(password, email);
    } catch {
      return false;
    }
    if (token) {
      clearApiCache();
      writeToken(token);
      this.authenticated.set(true);
      return true;
    }
    return false;
  }

  /** Create an editor account and immediately start its session. */
  async register(email: string, password: string): Promise<boolean> {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { token?: string };
      if (!body.token) return false;
      clearApiCache();
      writeToken(body.token);
      this.authenticated.set(true);
      return true;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' });
    clearApiCache();
    clearToken();
    this.authenticated.set(false);
  }
}

async function requestLogin(password: string, email?: string): Promise<string | null> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, ...(email ? { email } : {}) }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { token?: string };
  return body.token ?? null;
}

function readToken(): string | null {
  return catchFn(() => sessionStorage.getItem(TOKEN_KEY)).data;
}

function writeToken(token: string): void {
  catchFn(() => sessionStorage.setItem(TOKEN_KEY, token));
}

function clearToken(): void {
  catchFn(() => sessionStorage.removeItem(TOKEN_KEY));
}
