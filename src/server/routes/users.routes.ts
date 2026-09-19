import { Router } from 'express';
import crypto from 'node:crypto';
import {
  authenticate,
  bearerToken,
  hashPassword,
  publicUser,
  requireRole,
  tokenHash,
  verifyPassword,
} from '../auth.js';
import type { Repository } from '../repository.js';
import {
  accountDeleteSchema,
  emailUpdateSchema,
  passwordChangeSchema,
  passwordUpdateSchema,
  userCreateSchema,
} from '../schemas.js';
import { param, validate } from './helpers.js';

export function usersRoutes(repository: Repository): Router {
  const router = Router();

  // ---- Self-service account management (authenticated user) ----------------

  router.get('/me', authenticate(repository), (req, res) => res.json(publicUser(req.user!)));

  router.patch('/me', authenticate(repository), async (req, res) => {
    const body = validate(emailUpdateSchema, req.body, res);
    if (!body) return;
    const user = req.user!;
    if (!(await verifyPassword(body.currentPassword, user.passwordHash)))
      return res.status(403).json({ error: 'invalid password' });
    const email = body.email.toLowerCase();
    if (email === user.email) return res.json(publicUser(user));
    if (await repository.userByEmail(email))
      return res.status(409).json({ error: 'email already exists' });
    await repository.updateUserEmail(user.id, email);
    res.json(publicUser({ ...user, email }));
  });

  router.patch('/me/password', authenticate(repository), async (req, res) => {
    const body = validate(passwordChangeSchema, req.body, res);
    if (!body) return;
    const user = req.user!;
    if (!(await verifyPassword(body.currentPassword, user.passwordHash)))
      return res.status(403).json({ error: 'invalid password' });
    await repository.updateUserPassword(user.id, await hashPassword(body.newPassword));
    const currentToken = bearerToken(req.headers.authorization);
    await repository.clearUsersSessions(
      user.id,
      currentToken ? tokenHash(currentToken) : undefined,
    );
    res.status(204).end();
  });

  router.delete('/me', authenticate(repository), async (req, res) => {
    const body = validate(accountDeleteSchema, req.body, res);
    if (!body) return;
    const user = req.user!;
    if (!(await verifyPassword(body.currentPassword, user.passwordHash)))
      return res.status(403).json({ error: 'invalid password' });
    await repository.deleteUserWithData(user.id);
    res.status(204).end();
  });

  // ---- Admin user management ------------------------------------------------

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
