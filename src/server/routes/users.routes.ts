import crypto from 'node:crypto';
import { Router } from 'express';
import { authenticate, hashPassword, publicUser, requireRole } from '../auth.js';
import type { Repository } from '../repository.js';
import { passwordUpdateSchema, userCreateSchema } from '../schemas.js';
import { param, validate } from './helpers.js';

export function usersRoutes(repository: Repository): Router {
  const router = Router();

  router.get('/', authenticate(repository), requireRole('admin'), async (_req, res) =>
    res.json((await repository.users()).map(publicUser)),
  );

  router.post('/', authenticate(repository), requireRole('admin'), async (req, res) => {
    const body = validate(userCreateSchema, req.body, res);
    if (!body) return;
    const email = body.email.toLowerCase();
    if (await repository.userByEmail(email))
      return res.status(409).json({ error: 'email already exists' });
    const user = {
      id: crypto.randomUUID(),
      email,
      passwordHash: await hashPassword(body.password),
      role: body.role,
      createdAt: new Date().toISOString(),
    };
    await repository.createUser(user);
    res.status(201).json(publicUser(user));
  });

  router.patch('/:id/password', authenticate(repository), async (req, res) => {
    const body = validate(passwordUpdateSchema, req.body, res);
    if (!body) return;
    const id = param(req, 'id');
    if (req.user!.id !== id && req.user!.role !== 'admin')
      return res.status(403).json({ error: 'insufficient permissions' });
    if (!(await repository.updateUserPassword(id, await hashPassword(body.password))))
      return res.status(404).json({ error: 'not found' });

    await repository.clearUsersSessions(id);

    res.status(204).end();
  });

  return router;
}
