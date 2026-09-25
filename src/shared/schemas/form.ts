import z from 'zod';
import { CatchFnResult, catchFn } from '../helper';
import { FormDefinition, FormSettings, FormWithOwner } from '../model';
import { conditionGroupSchema } from './conditions';
import { elementsSchema } from './elements';

const pageDefinitionSchema = z.strictObject({
  id: z.string(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  enabledWhen: conditionGroupSchema.optional(),
  elements: elementsSchema,
});

export const formSettingsSchema = z.strictObject({
  name: z.string().optional(),
  submitLabel: z.string().optional(),
  showProgress: z.boolean().optional(),
  allowBack: z.boolean().optional(),
  navigation: z.union([z.literal('linear'), z.literal('free'), z.literal('auto')]),
  enableAutoSave: z.boolean().optional(),
}) satisfies z.ZodType<FormSettings>;

const formOwnerSchema = z.strictObject({
  id: z.string(),
  email: z.string(),
  role: z.enum(['admin', 'editor']),
  createdAt: z.string(),
});

export const formDefinitionSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  ownerId: z.string().min(1).max(128).optional(),
  owner: formOwnerSchema.nullable().optional(),
  description: z.string().optional(),
  version: z.number(),
  schemaVersion: z.literal(1),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  settings: formSettingsSchema,
  pages: z.array(pageDefinitionSchema),
}) satisfies z.ZodType<FormDefinition>;

export const formsDefinitionSchema = z.array(formDefinitionSchema);

export const formWithOwnerSchema = formDefinitionSchema.extend({
  ownerId: z.string().min(1).max(128),
  owner: formOwnerSchema.nullable(),
}) satisfies z.ZodType<FormWithOwner>;

export const formsWithOwnerSchema = z.array(formWithOwnerSchema);

export function stripFormOwnership(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { ownerId: _ownerId, owner: _owner, ...form } = value as Record<string, unknown>;
  return form;
}

export function parseFormData(json: string): CatchFnResult<FormDefinition> {
  return catchFn(() => formDefinitionSchema.parse(stripFormOwnership(JSON.parse(json))));
}
