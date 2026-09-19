import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '@shared/model/user.model';
import { UsersRepository } from './users.repository';

function makeUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: '1',
    email: 'demo@formmaker.local',
    role: 'editor',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('UsersRepository', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeUser()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('me() GETs the current user', async () => {
    const repo = new UsersRepository();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeUser({ email: 'changed@formmaker.local' })),
    });

    const user = await repo.me();

    expect(fetchMock).toHaveBeenCalledWith('/api/users/me', expect.any(Object));
    expect(user.email).toBe('changed@formmaker.local');
  });

  it('updateEmail() PATCHes the new email with the current password', async () => {
    const repo = new UsersRepository();
    const updated = makeUser({ email: 'new@formmaker.local' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(updated),
    });

    const user = await repo.updateEmail('new@formmaker.local', 'formmaker');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/me',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ email: 'new@formmaker.local', currentPassword: 'formmaker' }),
      }),
    );
    expect(user).toEqual(updated);
  });

  it('changePassword() PATCHes the password endpoint', async () => {
    const repo = new UsersRepository();
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: () => Promise.reject() });

    await repo.changePassword('formmaker', 'newpassword');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/me/password',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ currentPassword: 'formmaker', newPassword: 'newpassword' }),
      }),
    );
  });

  it('deleteAccount() DELETEs the account with the current password', async () => {
    const repo = new UsersRepository();
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: () => Promise.reject() });

    await repo.deleteAccount('formmaker');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/me',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ currentPassword: 'formmaker' }),
      }),
    );
  });

  it('propagates server errors', async () => {
    const repo = new UsersRepository();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: 'email already exists' }),
    });

    await expect(repo.updateEmail('taken@formmaker.local', 'formmaker')).rejects.toMatchObject({
      status: 409,
      message: 'email already exists',
    });
  });
});
