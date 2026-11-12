import * as z from 'zod/mini';
import { catchFn, type CatchFnResult } from '../helper';
import {
  documentIssues,
  ELEMENT_TYPES,
  FORM_SCHEMA_VERSION,
  type FormDefinition,
  type FormDocument,
  type FormPatch,
  type FormSettings,
  type FormWithOwner,
  type PageDefinition,
  type PagePatch,
  type SaveFormDefinition,
} from '../model';
import { conditionGroupSchema } from './conditions';
import { elementDefinitionSchema, formElementsSchema } from './elements';

/** Max length of a localized default text the client sends along with a create/clone request. */
const DEFAULT_TEXT_MAX = 50;

export const pageDefinitionSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  subtitle: z._default(z.string(), ''),
  enabledWhen: z.optional(conditionGroupSchema),
  children: z._default(z.array(z.string()), []),
}) satisfies z.ZodMiniType<PageDefinition>;

/** Reports every structural problem of the element tree, see `documentIssues`. */
function checkDocument(form: FormDocument, ctx: z.core.$RefinementCtx): void {
  for (const message of documentIssues(form)) {
    ctx.addIssue({ code: 'custom', message, path: ['elements'] });
  }
}

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

export const saveFormDefinitionSchema = z
  .strictObject({
    id: z.string(),
    name: z.optional(z.string()),
    ownerId: z.optional(z.string().check(z.minLength(1), z.maxLength(128))),
    owner: z.optional(z.nullable(formOwnerSchema)),
    description: z.optional(z.string()),
    settings: formSettingsSchema,
    pages: z.array(pageDefinitionSchema),
    elements: formElementsSchema,
  })
  .check(z.superRefine(checkDocument)) satisfies z.ZodMiniType<SaveFormDefinition>;

const formDefinitionObject = z.strictObject({
  id: z.string(),
  name: z.optional(z.string()),
  ownerId: z.optional(z.string().check(z.minLength(1), z.maxLength(128))),
  owner: z.optional(z.nullable(formOwnerSchema)),
  description: z.optional(z.string()),
  version: z.number(),
  schemaVersion: z.literal(FORM_SCHEMA_VERSION),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: formSettingsSchema,
  pages: z.array(pageDefinitionSchema),
  elements: formElementsSchema,
});

export const formDefinitionSchema = formDefinitionObject.check(
  z.superRefine(checkDocument),
) satisfies z.ZodMiniType<FormDefinition>;

export const formsDefinitionSchema = z.array(formDefinitionSchema);

export const formWithOwnerSchema = z
  .extend(formDefinitionObject, {
    ownerId: z.string().check(z.minLength(1), z.maxLength(128)),
    owner: z.nullable(formOwnerSchema),
  })
  .check(z.superRefine(checkDocument)) satisfies z.ZodMiniType<FormWithOwner>;

export const formsWithOwnerSchema = z.array(formWithOwnerSchema);

export const createPageSchema = z.strictObject({
  title: z.string(),
});

/** Max length of a form name sent to the form PATCH endpoint. */
const FORM_NAME_MAX = 1000;
/** Max length of a form description sent to the form PATCH endpoint. */
const FORM_DESCRIPTION_MAX = 10_000;

/** Body of `PATCH /api/forms/:formId`; `settings` is merged field by field. */
export const updateFormSchema = z.strictObject({
  name: z.optional(z.string().check(z.maxLength(FORM_NAME_MAX))),
  description: z.optional(z.string().check(z.maxLength(FORM_DESCRIPTION_MAX))),
  settings: z.optional(z.partial(formSettingsSchema)),
}) satisfies z.ZodMiniType<FormPatch>;

export type UpdateFormRequest = z.infer<typeof updateFormSchema>;

/** Max length of a page title sent to the page PATCH endpoint. */
const PAGE_TITLE_MAX = 1000;
/** Max length of a page subtitle sent to the page PATCH endpoint. */
const PAGE_SUBTITLE_MAX = 10_000;

/** Body of `PATCH /api/forms/:formId/pages/:pageId`; null removes the condition. */
export const updatePageSchema = z.strictObject({
  title: z.optional(z.string().check(z.maxLength(PAGE_TITLE_MAX))),
  subtitle: z.optional(z.string().check(z.maxLength(PAGE_SUBTITLE_MAX))),
  enabledWhen: z.optional(z.nullable(conditionGroupSchema)),
}) satisfies z.ZodMiniType<PagePatch>;

export type UpdatePageRequest = z.infer<typeof updatePageSchema>;

/** Body of `POST /api/forms`, which creates a new empty form. */
export const newFormSchema = z._default(
  z.strictObject({
    /** Localized title of the form's first page, e.g. "Page 1". */
    pageTitle: z.optional(z.string().check(z.maxLength(DEFAULT_TEXT_MAX))),
  }),
  {},
);

export type NewFormRequest = z.infer<typeof newFormSchema>;

const defaultTextSchema = z.string().check(z.maxLength(DEFAULT_TEXT_MAX));

export const createElementSchema = z.strictObject({
  type: z.enum(ELEMENT_TYPES),
  label: z.string(),
  parentId: z.string().check(z.minLength(1)),
  afterId: z.optional(z.nullable(z.string())),
  /** Localized default texts for the new element (see `ElementDefaultTexts`). */
  defaults: z.optional(
    z.strictObject({
      option: z.optional(defaultTextSchema),
      scaleMin: z.optional(defaultTextSchema),
      scaleMax: z.optional(defaultTextSchema),
    }),
  ),
});

export type CreateElementRequest = z.infer<typeof createElementSchema>;

/**
 * Body of `POST /api/forms/:formId/elements/:elementId/move`. `index` is the position
 * in the children of `parentId` once the element has been detached (see `moveElementTo`).
 */
export const moveElementSchema = z.strictObject({
  parentId: z.string().check(z.minLength(1)),
  index: z.number().check(z.int(), z.nonnegative()),
});

export type MoveElementRequest = z.infer<typeof moveElementSchema>;

export const cloneRequestSchema = z.strictObject({
  /** Localized suffix appended to the copied labels/titles, e.g. "(copy)". */
  suffix: defaultTextSchema,
});

export type CloneRequest = z.infer<typeof cloneRequestSchema>;

export const cloneElementResponseSchema = z.strictObject({
  element: elementDefinitionSchema,
  subtree: z.array(elementDefinitionSchema),
});

export type CloneElementResponse = z.infer<typeof cloneElementResponseSchema>;

export const clonePageResponseSchema = z.strictObject({
  page: pageDefinitionSchema,
  elements: z.array(elementDefinitionSchema),
});

export type ClonePageResponse = z.infer<typeof clonePageResponseSchema>;

/** Max length of an option label sent to the option endpoints. */
const OPTION_LABEL_MAX = 1000;

const optionLabelSchema = z.string().check(z.maxLength(OPTION_LABEL_MAX));

export const createOptionSchema = z.strictObject({
  label: optionLabelSchema,
});

export type CreateOptionRequest = z.infer<typeof createOptionSchema>;

export const updateOptionSchema = z.strictObject({
  label: z.optional(optionLabelSchema),
});

export type UpdateOptionRequest = z.infer<typeof updateOptionSchema>;

/**
 * Body of `POST /api/forms/:formId/elements/:elementId/options/:optionId/move`. `index`
 * is the position among the options once the option has been taken out (clamped).
 */
export const moveOptionSchema = z.strictObject({
  index: z.number().check(z.int(), z.nonnegative()),
});

export type MoveOptionRequest = z.infer<typeof moveOptionSchema>;

export function stripFormOwnership(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { ownerId: _ownerId, owner: _owner, ...form } = value as Record<string, unknown>;
  return form;
}

export function parseFormData(json: string): CatchFnResult<FormDefinition> {
  return catchFn(() => formDefinitionSchema.parse(stripFormOwnership(JSON.parse(json))));
}
