import { emptyConditionGroup } from './conditions.model';
import type {
  ElementDefinition,
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

/** Localized default texts of a new element; missing ones fall back to English. */
export interface ElementDefaultTexts {
  /** Prefix of the default choice options, numbered as "<option> 1", "<option> 2". */
  option?: string;
  scaleMin?: string;
  scaleMax?: string;
}

function defaultOptions(option = 'Option') {
  return [
    { id: uuid(), label: `${option} 1` },
    { id: uuid(), label: `${option} 2` },
  ];
}

export function createElement(
  type: QuestionType,
  label: string,
  defaults?: ElementDefaultTexts,
): QuestionDefinition;
export function createElement(
  type: 'group',
  label: string,
  defaults?: ElementDefaultTexts,
): GroupElement;
export function createElement(
  type: ElementType,
  label: string,
  defaults?: ElementDefaultTexts,
): ElementDefinition;
export function createElement(
  type: ElementType,
  label: string,
  defaults: ElementDefaultTexts = {},
): ElementDefinition {
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
      return { ...qBase, type: 'choice', options: defaultOptions(defaults.option) };
    case 'dropdown':
      return { ...qBase, type: 'dropdown', options: defaultOptions(defaults.option) };
    case 'multiChoice':
      return { ...qBase, type: 'multiChoice', options: defaultOptions(defaults.option) };
    case 'scale':
      return {
        ...qBase,
        type: 'scale',
        min: 0,
        max: 10,
        step: 1,
        minLabel: defaults.scaleMin ?? 'Low',
        maxLabel: defaults.scaleMax ?? 'High',
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
