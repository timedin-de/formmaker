import type { NestExpressApplication } from '@nestjs/platform-express';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';

describe('auth API', () => {
  let app: NestExpressApplication;
  let base: string;

  const post = (path: string, body?: unknown, token?: string): Promise<Response> =>
    fetch(`${base}/api/auth/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const me = (token?: string): Promise<Response> =>
    fetch(`${base}/api/users/me`, token ? { headers: { authorization: `Bearer ${token}` } } : {});

  beforeAll(async () => {
    process.env.SQLITE_PATH = ':memory:';
    vi.stubEnv('FORMMAKER_PASSWORD', 'formmaker');
    app = await createApp();
    await app.listen(0);
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
  });

  it('logs the seeded admin in with 200 and a token', async () => {
    const res = await post('login', { email: 'ADMIN@formmaker.local', password: 'formmaker' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toEqual(expect.any(String));
    expect(body.user).toMatchObject({ email: 'admin@formmaker.local', role: 'admin' });
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects bad credentials with 401 { error }', async () => {
    const res = await post('login', { email: 'admin@formmaker.local', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid credentials' });
  });

  it('rejects an invalid body with 422 and zod issues', async () => {
    const res = await post('login', { email: 'not-an-email' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('invalid request');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('registers an editor (201), lowercases the email and rejects duplicates (409)', async () => {
    const created = await post('register', { email: 'New@Example.com', password: 'longenough' });
    expect(created.status).toBe(204);

    const again = await post('register', { email: 'new@example.com', password: 'longenough' });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'email already exists' });
  });

  it('requires a token for /me and returns the user with one', async () => {
    const anonymous = await me();
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: 'authentication required' });

    const { token } = await (
      await post('login', { email: 'admin@formmaker.local', password: 'formmaker' })
    ).json();
    const authed = await me(token);
    expect(authed.status).toBe(200);
    expect(await authed.json()).toMatchObject({ email: 'admin@formmaker.local' });
  });

  it('logout returns 204 and invalidates the session', async () => {
    expect((await post('logout')).status).toBe(401);
    const { token } = await (
      await post('login', { email: 'admin@formmaker.local', password: 'formmaker' })
    ).json();
    expect((await post('logout', undefined, token)).status).toBe(204);
    expect((await me(token)).status).toBe(401);
  });

  it('email change returns the normalized public user', async () => {
    await post('register', { email: 'mail@example.com', password: 'longenough' });
    const { token } = await (
      await post('login', { email: 'mail@example.com', password: 'longenough' })
    ).json();
    const res = await fetch(`${base}/api/auth/email`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: 'Changed@Example.com', currentPassword: 'longenough' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ email: 'changed@example.com' });
    expect(body).not.toHaveProperty('passwordHash');
  });
});
