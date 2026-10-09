import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AppModule } from './app.module.js';
import { AuthService } from './auth/auth.service';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { useRe2Regex } from './common/re2-regex.js';

/**
 * Nest app wrapping the Express instance. Routes not yet ported to Nest
 * controllers stay as Express routers mounted below; port them one module at a
 * time. Registration order matters: everything added to `app` before
 * `nest.init()` runs ahead of Nest's routes and of Nest's own 404 handler.
 */
export async function createApp(): Promise<NestExpressApplication> {
  useRe2Regex();

  const app = express();
  app.disable('x-powered-by');
  const corsOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use(cors({ origin: corsOrigins?.length ? corsOrigins : false }));
  // Body parsing stays here (Nest's parser is disabled) so the 50mb limit covers all routes.
  app.use(express.json({ limit: '50mb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Request-Id', crypto.randomUUID());
    next();
  });

  const tp = process.env.TRUST_PROXY;
  if (tp) app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : tp || false);

  const parsedLimit = parseInt(process.env.RATELIMIT ?? '');

  const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: parsedLimit >= 1 ? parsedLimit : 300,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(rateLimiter);

  const nest = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(app),
    {
      bodyParser: false,
      logger: ['error', 'warn'],
    },
  );
  nest.setGlobalPrefix('api');
  nest.useGlobalFilters(new ApiExceptionFilter());
  const authService = nest.get(AuthService);
  await authService.ensureInitialAdmin();

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

  await nest.init();
  return nest;
}
