import { Injectable, inject, signal } from '@angular/core';
import { catchFn } from '@shared/helper';
import type { PublicUser } from '@shared/model/user.model';
import { clearApiCache } from '../state/api-cache';
import { UsersRepository } from '../state/users.repository';

const TOKEN_KEY = 'formmaker.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly authenticated = signal<boolean>(!!readToken());
  readonly user = signal<PublicUser | null>(null);
  private readonly users = inject(UsersRepository);

  token(): string | null {
    return readToken();
  }

  /** Validate editor credentials against the server. */
  async login(email: string, password: string): Promise<boolean> {
    let token: string | null;
    try {
      token = await requestLogin(email, password);
    } catch {
      return false;
    }
    if (token) {
      clearApiCache();
      writeToken(token);
      this.authenticated.set(true);
      await this.loadUser();
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
      await this.loadUser();
      return true;
    } catch {
      return false;
    }
  }

  /** Refresh the current user profile from the server. */
  async loadUser(): Promise<void> {
    try {
      this.user.set(await this.users.me());
    } catch {
      this.user.set(null);
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearApiCache();
      clearToken();
      this.authenticated.set(false);
      this.user.set(null);
    }
  }
}

async function requestLogin(email: string, password: string): Promise<string | null> {
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
