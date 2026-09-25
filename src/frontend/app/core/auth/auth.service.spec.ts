import { TestBed } from '@angular/core/testing';
import type { PublicUser } from '@shared/model/user.model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersRepository } from '../state/users.repository';
import { AuthService } from './auth.service';

function makeUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: '1',
    email: 'demo@formmaker.local',
    role: 'editor',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AuthService', () => {
  const fetchMock = vi.fn();
  const meMock = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    meMock.mockReset().mockResolvedValue(makeUser());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function setup(): Promise<AuthService> {
    await TestBed.configureTestingModule({
      providers: [{ provide: UsersRepository, useValue: { me: meMock } }],
    }).compileComponents();
    return TestBed.inject(AuthService);
  }

  it('starts unauthenticated with no user', async () => {
    const auth = await setup();
    expect(auth.authenticated()).toBe(false);
    expect(auth.user()).toBeNull();
    expect(auth.token()).toBeNull();
  });

  it('starts authenticated when a token is already stored', async () => {
    sessionStorage.setItem('formmaker.token', 'existing');
    const auth = await setup();
    expect(auth.authenticated()).toBe(true);
    expect(auth.token()).toBe('existing');
    expect(auth.user()).toBeNull();
  });

  it('logs in, stores the token and loads the profile', async () => {
    const auth = await setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'abc123' }),
    });

    await expect(auth.login('demo@formmaker.local', 'formmaker')).resolves.toBe(true);

    expect(sessionStorage.getItem('formmaker.token')).toBe('abc123');
    expect(auth.authenticated()).toBe(true);
    expect(meMock).toHaveBeenCalledTimes(1);
    expect(auth.user()?.email).toBe('demo@formmaker.local');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        body: JSON.stringify({ password: 'formmaker', email: 'demo@formmaker.local' }),
      }),
    );
  });

  it('returns false on a failed login request without touching session', async () => {
    const auth = await setup();
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });

    await expect(auth.login('demo@formmaker.local', 'formmaker')).resolves.toBe(false);
    expect(auth.authenticated()).toBe(false);
    expect(meMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('formmaker.token')).toBeNull();
  });

  it('returns false when the login body carries no token', async () => {
    const auth = await setup();
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await expect(auth.login('demo@formmaker.local', 'formmaker')).resolves.toBe(false);
  });

  it('registers a new account and loads the profile', async () => {
    const auth = await setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'fresh-token',
          user: {
            id: '',
            createdAt: '',
            role: 'editor',
            email: 'email@email.com',
          },
        }),
    });

    await expect(auth.register('new@formmaker.local', 'formmaker')).resolves.toBe(true);
    expect(sessionStorage.getItem('formmaker.token')).toBe('fresh-token');
    expect(auth.authenticated()).toBe(true);
    expect(auth.user()?.email).toBe('demo@formmaker.local');
  });

  it('returns false on a failed registration', async () => {
    const auth = await setup();
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });

    await expect(auth.register('new@formmaker.local', 'formmaker')).resolves.toBe(false);
    expect(auth.authenticated()).toBe(false);
  });

  it('clears the user when the profile cannot be loaded', async () => {
    const auth = await setup();
    auth.user.set(makeUser({ email: 'stale@formmaker.local' }));
    meMock.mockRejectedValue(new Error('offline'));

    await auth.loadUser();
    expect(auth.user()).toBeNull();
  });

  it('logout ends the session and clears the user', async () => {
    const auth = await setup();
    auth.authenticated.set(true);
    auth.user.set(makeUser());
    sessionStorage.setItem('formmaker.token', 'abc123');
    fetchMock.mockResolvedValue({ ok: true });

    await auth.logout();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(auth.authenticated()).toBe(false);
    expect(auth.user()).toBeNull();
    expect(sessionStorage.getItem('formmaker.token')).toBeNull();
    expect(auth.token()).toBeNull();
  });
});
