import z from 'zod';
import { type CatchFnResult, catchFn } from '../helper';
import {
  documentIssues,
  ELEMENT_TYPES,
  FORM_SCHEMA_VERSION,
  type FormDefinition,
  type FormDocument,
  type FormSettings,
  type FormWithOwner,
  type PageDefinition,
  type SaveFormDefinition,
} from '../model';
import { conditionGroupSchema } from './conditions';
import { formElementsSchema } from './elements';

export const pageDefinitionSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().default(''),
  enabledWhen: conditionGroupSchema.optional(),
  children: z.array(z.string()).default([]),
}) satisfies z.ZodType<PageDefinition>;

/** Reports every structural problem of the element tree, see `documentIssues`. */
function checkDocument(form: FormDocument, ctx: z.RefinementCtx): void {
  for (const message of documentIssues(form)) {
    ctx.addIssue({ code: 'custom', message, path: ['elements'] });
  }
}

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

export const saveFormDefinitionSchema = z
  .strictObject({
    id: z.string(),
    name: z.string().optional(),
    ownerId: z.string().min(1).max(128).optional(),
    owner: formOwnerSchema.nullable().optional(),
    description: z.string().optional(),
    settings: formSettingsSchema,
    pages: z.array(pageDefinitionSchema),
    elements: formElementsSchema,
  })
  .superRefine(checkDocument) satisfies z.ZodType<SaveFormDefinition>;

const formDefinitionObject = z.strictObject({
  id: z.string(),
  name: z.string().optional(),
  ownerId: z.string().min(1).max(128).optional(),
  owner: formOwnerSchema.nullable().optional(),
  description: z.string().optional(),
  version: z.number(),
  schemaVersion: z.literal(FORM_SCHEMA_VERSION),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: formSettingsSchema,
  pages: z.array(pageDefinitionSchema),
  elements: formElementsSchema,
});

export const formDefinitionSchema = formDefinitionObject.superRefine(
  checkDocument,
) satisfies z.ZodType<FormDefinition>;

export const formsDefinitionSchema = z.array(formDefinitionSchema);

export const formWithOwnerSchema = formDefinitionObject
  .extend({
    ownerId: z.string().min(1).max(128),
    owner: formOwnerSchema.nullable(),
  })
  .superRefine(checkDocument) satisfies z.ZodType<FormWithOwner>;

export const formsWithOwnerSchema = z.array(formWithOwnerSchema);

export const createPageSchema = z.strictObject({
  title: z.string(),
});

export const createElementSchema = z.strictObject({
  type: z.enum(ELEMENT_TYPES),
  label: z.string(),
  parentId: z.string().min(1),
  afterId: z.string().nullable().optional(),
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
