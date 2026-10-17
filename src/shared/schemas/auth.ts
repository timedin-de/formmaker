import * as z from 'zod/mini';
import { type PublicUser } from '../model';

const roles = ['admin', 'editor'] as const;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().check(z.minLength(1)),
});
export const userCreateSchema = z.object({
  email: z.email().check(z.maxLength(320), z.trim(), z.toLowerCase()),
  password: z.string().check(z.minLength(8), z.maxLength(256)),
  role: z._default(z.enum(roles), 'editor'),
});

export const publicUserSchema = z.extend(z.pick(userCreateSchema, { email: true, role: true }), {
  id: z.string().check(z.maxLength(128)),
  createdAt: z.string(),
}) satisfies z.ZodMiniType<PublicUser>;

export const registrationSchema = z.pick(userCreateSchema, { email: true, password: true });
export const passwordUpdateSchema = z.object({
  password: z.string().check(z.minLength(8), z.maxLength(256)),
});
export const emailUpdateSchema = z.object({
  email: z.email().check(z.maxLength(320)),
  currentPassword: z.string().check(z.minLength(8)),
});
export const passwordChangeSchema = z.object({
  currentPassword: z.string().check(z.minLength(1)),
  newPassword: z.string().check(z.minLength(8), z.maxLength(256)),
});
export const accountDeleteSchema = z.object({ currentPassword: z.string().check(z.minLength(8)) });
