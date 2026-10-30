import { type I18nService } from '../frontend/app/core/i18n';
import {
  type Condition,
  type ConditionGroup,
  type ElementDefinition,
  type FormDefinition,
  type GroupElement,
  QUESTION_TYPES,
  type QuestionDefinition,
  type QuestionType,
  type SaveFormDefinition,
} from './model';

// Helper function that checks if the value exists in the object
export function has<T extends object, K extends PropertyKey>(
  object: T,
  attribute: K,
): object is Extract<T, Record<K, unknown>> {
  return attribute in object;
}

export type CatchFnResult<T> = { data: T; error: null } | { data: null; error: unknown };

/** Execute a synchronous operation that may throw without losing its error. */
export function catchFn<T>(fn: () => T): CatchFnResult<T> {
  try {
    return { data: fn(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function catchFnAsync<T>(fn: () => Promise<T>): Promise<CatchFnResult<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export function walkConditionGroup(condition: ConditionGroup, callback: (cg: Condition) => void) {
  condition.conditions.forEach(callback);
  if (condition.groups.length) condition.groups.forEach((c) => walkConditionGroup(c, callback));
}

export function isQuestion<T extends ElementDefinition>(
  object: T,
): object is Extract<T, QuestionDefinition> {
  return QUESTION_TYPES.includes(object.type as QuestionType);
}

export function isChoice<T extends ElementDefinition>(
  object: T,
): object is Extract<T, { type: 'choice' | 'dropdown' | 'multiChoice' }> {
  return ['choice', 'dropdown', 'multiChoice'].includes(object.type);
}

export function isQuestionOrGroup<T extends ElementDefinition>(
  object: T,
): object is Extract<T, QuestionDefinition | GroupElement> {
  return QUESTION_TYPES.includes(object.type as QuestionType) || object.type === 'group';
}
export function formName(form: FormDefinition, i18n: I18nService) {
  return (
    form.name ??
    i18n.t('builder.untitled', {
      date: form.createdAt ? new Date(form.createdAt).toLocaleDateString(i18n.lang()) : '',
    })
  );
}

export function toSaveableForm(form: FormDefinition): SaveFormDefinition {
  const {
    version: _v,
    schemaVersion: _schemaVersion,
    createdAt: _created,
    updatedAt: _updated,
    ...saveable
  } = form;
  return saveable;
}
