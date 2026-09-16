import type { Request, Response } from 'express';
import type { z } from 'zod';

/** Read a URL param that may be a string or a string[]. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export function validate<T>(schema: z.ZodType<T>, value: unknown, res: Response): T | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  res.status(422).json({ error: 'invalid request', details: parsed.error.issues });
  return null;
}

export function canManageForm(ownerId: string, req: Request): boolean {
  return req.user?.role === 'admin' || req.user?.id === ownerId;
}
