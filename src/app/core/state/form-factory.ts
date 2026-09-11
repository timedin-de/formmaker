import type {
  ChoiceElement,
  ElementDefinition,
  Elements,
  FormDefinition,
  PageDefinition,
  QuestionType,
} from '../model/form.model';
import { elementId, pageId, uuid } from '../model/ids';
import { emptyConditionGroup } from '../model/conditions.model';

export function newForm(name = 'Untitled form'): FormDefinition {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    name,
    description: '',
    version: 1,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    settings: {
      submitLabel: 'Submit',
      showProgress: true,
      allowBack: true,
      navigation: 'auto',
      enableAutoSave: true,
    },
    pages: [createPage(), createPage()],
  };
}

export function createPage(title = 'New page'): PageDefinition {
  return { id: pageId(), title, elements: [], enabledWhen: emptyConditionGroup() };
}

export function createElement(
  type: QuestionType | 'group' | 'section',
  label: string,
): ElementDefinition {
  const base = {
    id: elementId('q'),
    label,
    enabledWhen: emptyConditionGroup(),
    validations: [] as never[],
    width: 'full' as const,
  };
  switch (type) {
    case 'text':
      return { ...base, type: 'text', inputType: 'text', maxLength: 255 };
    case 'longText':
      return { ...base, type: 'longText', rows: 4 };
    case 'number':
      return { ...base, type: 'number' };
    case 'date':
      return { ...base, type: 'date' };
    case 'time':
      return { ...base, type: 'time' };
    case 'dateTime':
      return { ...base, type: 'dateTime' };
    case 'boolean':
      return { ...base, type: 'boolean' };
    case 'choice':
      return {
        ...base,
        type: 'choice',
        options: [
          { id: uuid(), label: 'Option 1', value: 'option_1' },
          { id: uuid(), label: 'Option 2', value: 'option_2' },
        ],
      } as ChoiceElement;
    case 'dropdown':
      return {
        ...base,
        type: 'dropdown',
        options: [
          { id: uuid(), label: 'Option 1', value: 'option_1' },
          { id: uuid(), label: 'Option 2', value: 'option_2' },
        ],
      } as ChoiceElement;
    case 'multiChoice':
      return {
        ...base,
        type: 'multiChoice',
        options: [
          { id: uuid(), label: 'Option 1', value: 'option_1' },
          { id: uuid(), label: 'Option 2', value: 'option_2' },
        ],
      } as ChoiceElement;
    case 'scale':
      return {
        ...base,
        type: 'scale',
        min: 0,
        max: 10,
        step: 1,
        minLabel: 'Low',
        maxLabel: 'High',
      };
    case 'file':
      return { ...base, type: 'file', multiple: false };
    case 'signature':
      return { ...base, type: 'signature' };
    case 'group':
      return { ...base, type: 'group', elements: [] };
    case 'section':
      return { ...base, type: 'section', heading: 'Section heading' };
  }
}

export function insertElementAfter(
  elements: Elements,
  after: string | null,
  el: ElementDefinition,
): Elements {
  const idx = after ? elements.findIndex((e) => e.id === after) : -1;
  const next = [...elements];
  next.splice(idx + 1, 0, el);
  return next;
}

/** Build a form with `count` pages × `perPage` simple text fields for load testing. */
export function buildStressForm(count = 40, perPage = 50): FormDefinition {
  const form = newForm(`Stress ${count * perPage} questions`);
  form.pages = Array.from({ length: count }, (_, p) => {
    const page = createPage(`Page ${p + 1}`);
    page.elements = Array.from({ length: perPage }, (_, i) => {
      const n = p * perPage + i + 1;
      return createElement('text', `Question ${n}`);
    });
    return page;
  });
  return form;
}
