import * as z from 'zod/mini';
import { type CatchFnResult, catchFn } from '../helper';
import {
  ELEMENT_TYPES,
  type FormDefinition,
  type FormSettings,
  type FormWithOwner,
  type PageDefinition,
  type SaveFormDefinition,
} from '../model';
import { conditionGroupSchema } from './conditions';
import { elementsSchema } from './elements';

export const pageDefinitionSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  subtitle: z._default(z.string(), ''),
  enabledWhen: z.optional(conditionGroupSchema),
  elements: elementsSchema,
}) satisfies z.ZodMiniType<PageDefinition>;

export const formSettingsSchema = z.strictObject({
  name: z.optional(z.string()),
  submitLabel: z.optional(z.string()),
  showProgress: z.optional(z.boolean()),
  allowBack: z.optional(z.boolean()),
  navigation: z.union([z.literal('linear'), z.literal('free'), z.literal('auto')]),
  enableAutoSave: z.optional(z.boolean()),
}) satisfies z.ZodMiniType<FormSettings>;

const formOwnerSchema = z.strictObject({
  id: z.string(),
  email: z.string(),
  role: z.enum(['admin', 'editor']),
  createdAt: z.string(),
});

export const saveFormDefinitionSchema = z.strictObject({
  id: z.string(),
  name: z.optional(z.string()),
  ownerId: z.optional(z.string().check(z.minLength(1), z.maxLength(128))),
  owner: z.optional(z.nullable(formOwnerSchema)),
  description: z.optional(z.string()),
  settings: formSettingsSchema,
  pages: z.array(pageDefinitionSchema),
}) satisfies z.ZodMiniType<SaveFormDefinition>;

export const formDefinitionSchema = z.strictObject({
  id: z.string(),
  name: z.optional(z.string()),
  ownerId: z.optional(z.string().check(z.minLength(1), z.maxLength(128))),
  owner: z.optional(z.nullable(formOwnerSchema)),
  description: z.optional(z.string()),
  version: z.number(),
  schemaVersion: z.literal(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: formSettingsSchema,
  pages: z.array(pageDefinitionSchema),
}) satisfies z.ZodMiniType<FormDefinition>;

export const formsDefinitionSchema = z.array(formDefinitionSchema);

export const formWithOwnerSchema = z.extend(formDefinitionSchema, {
  ownerId: z.string().check(z.minLength(1), z.maxLength(128)),
  owner: z.nullable(formOwnerSchema),
}) satisfies z.ZodMiniType<FormWithOwner>;

export const formsWithOwnerSchema = z.array(formWithOwnerSchema);

export const createPageSchema = z.strictObject({
  title: z.string(),
});

export const createElementSchema = z.strictObject({
  type: z.enum(ELEMENT_TYPES),
  label: z.string(),
  parentId: z.string().check(z.minLength(1)),
  afterId: z.optional(z.nullable(z.string())),
});

export type CreateElementRequest = z.infer<typeof createElementSchema>;

export function stripFormOwnership(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { ownerId: _ownerId, owner: _owner, ...form } = value as Record<string, unknown>;
  return form;
}

export function parseFormData(json: string): CatchFnResult<FormDefinition> {
  return catchFn(() => formDefinitionSchema.parse(stripFormOwnership(JSON.parse(json))));
}
