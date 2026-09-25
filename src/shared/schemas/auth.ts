import { PublicUser } from '@shared/model';
import { z } from 'zod';

const roles = ['admin', 'editor'] as const;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export const userCreateSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(8).max(256),
  role: z.enum(roles).default('editor'),
});

export const publicUserSchema = userCreateSchema.pick({ email: true, role: true }).extend({
  id: z.string().max(128),
  createdAt: z.string(),
}) satisfies z.ZodType<PublicUser>;

export const registrationSchema = userCreateSchema.pick({ email: true, password: true });
export const passwordUpdateSchema = z.object({ password: z.string().min(8).max(256) });
export const emailUpdateSchema = z.object({
  email: z.email().max(320),
  currentPassword: z.string().min(1),
});
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(256),
});
export const accountDeleteSchema = z.object({ currentPassword: z.string().min(1) });
