import type {
  ElementDefinition,
  Elements,
  ElementType,
  FormDefinition,
  PageDefinition,
  QuestionDefinition,
  QuestionType,
} from '@shared/model/form.model';
import { elementId, pageId, uuid } from '@shared/model/ids';
import { emptyConditionGroup } from '@shared/model/conditions.model';

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
    pages: [createPage()],
  };
}

export function createPage(title = 'New page'): PageDefinition {
  return { id: pageId(), title, elements: [], enabledWhen: emptyConditionGroup() };
}

export function createElement(type: QuestionType, label: string): QuestionDefinition;
export function createElement(type: ElementType, label: string): ElementDefinition;
export function createElement(type: ElementType, label: string): ElementDefinition {
  const base = {
    type,
    description: '',
    id: elementId('q'),
    label,
    enabledWhen: emptyConditionGroup(),
    width: 1,
  };
  const qBase = {
    ...base,
    defaultValue: null,
    required: false,
    readonly: false,
    validations: [],
  };

  const pBase = {
    ...qBase,
    placeholder: '',
  };
  switch (type) {
    case 'text':
      return { ...pBase, type: 'text', inputType: 'text', maxLength: 255 };
    case 'longText':
      return { ...pBase, type: 'longText', rows: 4 };
    case 'number':
      return { ...pBase, type: 'number' };
    case 'date':
      return { ...pBase, type: 'date' };
    case 'time':
      return { ...pBase, type: 'time' };
    case 'dateTime':
      return { ...pBase, type: 'dateTime' };
    case 'boolean':
      return { ...qBase, type: 'boolean' };
    case 'choice':
      return {
        ...qBase,
        type: 'choice',
        options: [
          { id: uuid(), label: 'Option 1', value: 'option_1' },
          { id: uuid(), label: 'Option 2', value: 'option_2' },
        ],
      };
    case 'dropdown':
      return {
        ...qBase,
        type: 'dropdown',
        options: [
          { id: uuid(), label: 'Option 1', value: 'option_1' },
          { id: uuid(), label: 'Option 2', value: 'option_2' },
        ],
      };
    case 'multiChoice':
      return {
        ...qBase,
        type: 'multiChoice',
        options: [
          { id: uuid(), label: 'Option 1', value: 'option_1' },
          { id: uuid(), label: 'Option 2', value: 'option_2' },
        ],
      };
    case 'scale':
      return {
        ...qBase,
        type: 'scale',
        min: 0,
        max: 10,
        step: 1,
        minLabel: 'Low',
        maxLabel: 'High',
      };
    case 'file':
      return { ...qBase, type: 'file', multiple: false };
    case 'signature':
      return { ...qBase, type: 'signature' };
    case 'group':
      return { ...base, type: 'group', defaultValue: null, elements: [] };
    case 'section':
      return { ...base, type: 'section', heading: 'Section heading' };
    case 'textdisplay':
      return { ...base, type: 'textdisplay' };
  }
}

export function insertElementAfter(
  elements: Elements,
  after: string | null,
  el: ElementDefinition,
): Elements {
  const idx = after ? elements.findIndex((e) => e.id === after) : elements.length;
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
