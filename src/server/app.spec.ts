import type { NestExpressApplication } from '@nestjs/platform-express';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

describe('app', () => {
  let app: NestExpressApplication;
  let base: string;

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

  it('serves the Nest health controller under /api', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('still serves the legacy Express routes', async () => {
    expect((await fetch(`${base}/api/forms`)).status).toBe(401);
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@formmaker.local', password: 'formmaker' }),
    });
    expect(login.status).toBe(200);
    expect(await login.json()).toHaveProperty('token');
  });

  it('returns 404 for unknown API paths', async () => {
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
  });
});
