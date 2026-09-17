import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { ensureInitialAdmin } from './auth.js';
import { createDatabase } from './database.js';
import { Repository } from './repository.js';
import { authRoutes } from './routes/auth.routes.js';
import { formsRoutes } from './routes/forms.routes.js';
import { usersRoutes } from './routes/users.routes.js';

const PORT = Number(process.env.PORT ?? 3000);

async function start(): Promise<void> {
  const source = await createDatabase();
  const repository = new Repository(source);
  await ensureInitialAdmin(repository);
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
  app.use(express.json({ limit: '50mb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Request-Id', crypto.randomUUID());
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes(repository));
  app.use('/api/users', usersRoutes(repository));
  app.use('/api/forms', formsRoutes(repository));

  const dist = path.resolve('dist/form-maker/browser');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled Server Error', error);
    if (res.headersSent) return;

    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    res
      .status(code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ? 409 : 500)
      .json({ error: 'internal server error' });
  });
  const server = app.listen(PORT, () =>
    console.log(`FormMaker API listening on http://localhost:${PORT}`),
  );

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`${signal} received, shutting down`);
    server.close();
    source
      .destroy()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
void start();
