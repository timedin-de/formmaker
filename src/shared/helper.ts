import {
  Condition,
  ConditionGroup,
  ElementDefinition,
  GroupElement,
  QUESTION_TYPES,
  QuestionDefinition,
  QuestionType,
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

export function walkGroup(
  elements: ElementDefinition[],
  callback: (element: ElementDefinition) => ElementDefinition,
): ElementDefinition[] {
  return elements.map((e) => {
    callback(e);
    if (e.type === 'group') {
      e.elements = walkGroup(e.elements, callback);
    }
    return e;
  });
}

export function walkConditionGroup(condition: ConditionGroup, callback: (cg: Condition) => void) {
  condition.conditions.forEach(callback);
  if (condition.groups.length) condition.groups.forEach((c) => walkConditionGroup(c, callback));
}

export function flattenQuestions(elements: ElementDefinition[]): QuestionDefinition[] {
  return filterQuestions(flattenElements(elements));
}

export function flattenElements(elements: ElementDefinition[]): ElementDefinition[] {
  return elements.flatMap((e) => (e.type === 'group' ? [e, ...flattenElements(e.elements)] : e));
}

export function filterQuestions(elements: ElementDefinition[]): QuestionDefinition[] {
  return elements.filter((e): e is QuestionDefinition =>
    QUESTION_TYPES.includes(e.type as QuestionType),
  );
}

export type QuestionGroupElement = GroupElement & {
  elements: (QuestionDefinition | QuestionGroupElement)[];
};

export function isQuestion<T extends ElementDefinition>(
  object: T,
): object is Extract<T, QuestionDefinition> {
  return QUESTION_TYPES.includes(object.type as QuestionType);
}

export function isQuestionOrGroup<T extends ElementDefinition>(
  object: T,
): object is Extract<T, QuestionDefinition | GroupElement> {
  return QUESTION_TYPES.includes(object.type as QuestionType) || object.type === 'group';
}
