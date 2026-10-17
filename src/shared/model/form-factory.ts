import { emptyConditionGroup } from './conditions.model';
import type {
  ElementDefinition,
  Elements,
  ElementType,
  GroupElement,
  PageDefinition,
  QuestionDefinition,
  QuestionType,
} from './form.model';
import { DEFAULT_TIME_INTERVAL } from './form.model';
import { elementId, uuid } from './ids';

export function createPage(title = 'New page'): PageDefinition {
  return {
    id: elementId('page'),
    title,
    subtitle: '',
    children: [],
    enabledWhen: emptyConditionGroup(),
  };
}

export function createElement(type: QuestionType, label: string): QuestionDefinition;
export function createElement(type: 'group', label: string): GroupElement;
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
      return { ...pBase, type: 'text', inputType: 'text' };
    case 'longText':
      return { ...pBase, type: 'longText', rows: 4 };
    case 'number':
      return { ...pBase, type: 'number' };
    case 'date':
      return { ...pBase, type: 'date' };
    case 'time':
      return { ...pBase, type: 'time', timeInterval: { ...DEFAULT_TIME_INTERVAL } };
    case 'dateTime':
      return { ...pBase, type: 'dateTime', timeInterval: { ...DEFAULT_TIME_INTERVAL } };
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
      return { ...base, type: 'group', defaultValue: null, children: [], collapsible: false };
    case 'section':
      return { ...base, type: 'section' };
    case 'textdisplay':
      return { ...base, type: 'textdisplay' };
  }
}

export function insertElementAfter(
  elements: Elements,
  after: string | null,
  el: ElementDefinition,
): Elements | null {
  const idx = after ? elements.findIndex((e) => e.id === after) : elements.length;
  if (idx === -1) return null;
  const next = [...elements];
  next.splice(idx + 1, 0, el);
  return next;
}

/**
 * Inserts `el` after `afterId` (or at the end) into the page or nested group `parentId`.
 * Returns the new pages, or null when no such parent exists or `afterId` is not a direct
 * child of it.
 */
export function insertIntoParent(
  pages: PageDefinition[],
  parentId: string,
  afterId: string | null,
  el: ElementDefinition,
): PageDefinition[] | null {
  let found = false;
  const insert = <T extends { id: string; elements: Elements }>(parent: T): T => {
    if (parent.id === parentId) {
      const elements = insertElementAfter(parent.elements, afterId, el);
      if (!elements) return parent;
      found = true;
      return { ...parent, elements };
    }
    const elements = parent.elements.map((e) => (e.type === 'group' ? insert(e) : e));
    return { ...parent, elements };
  };
  const next = pages.map(insert);
  return found ? next : null;
}
