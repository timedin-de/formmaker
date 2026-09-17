import crypto from 'node:crypto';
import { Router } from 'express';
import { authenticate, hashPassword, login, logout, publicUser } from '../auth.js';
import type { Repository } from '../repository.js';
import { loginSchema, registrationSchema } from '../schemas.js';
import { validate } from './helpers.js';

export function authRoutes(repository: Repository): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const body = validate(loginSchema, req.body, res);
    if (!body) return;
    const result = await login(repository, body.email, body.password);
    if (!result) return res.status(401).json({ error: 'invalid credentials' });
    res.json(result);
  });

  router.post('/register', async (req, res) => {
    const body = validate(registrationSchema, req.body, res);
    if (!body) return;
    const email = body.email.toLowerCase();
    if (await repository.userByEmail(email)) {
      return res.status(409).json({ error: 'email already exists' });
    }
    await repository.createUser({
      id: crypto.randomUUID(),
      email,
      passwordHash: await hashPassword(body.password),
      role: 'editor',
      createdAt: new Date().toISOString(),
    });
    const result = await login(repository, email, body.password);
    res.status(201).json(result);
  });

  router.post('/logout', authenticate(repository), async (req, res) => {
    await logout(repository, req);
    res.status(204).end();
  });

  router.get('/me', authenticate(repository), (req, res) => res.json(publicUser(req.user!)));

  return router;
}
