import type { ElementType } from '../../shared/model/form.model';
import { IconName } from '../icon-names';

export interface FieldTypeMeta {
  type: ElementType;
  label: string;
  icon: IconName;
  category: 'basic' | 'advanced' | 'layout';
  description: string;
}

export const FIELD_TYPES: FieldTypeMeta[] = [
  {
    type: 'text',
    label: 'Short text',
    icon: 'short_text',
    category: 'basic',
    description: 'Single-line text',
  },
  {
    type: 'longText',
    label: 'Long text',
    icon: 'notes',
    category: 'basic',
    description: 'Multi-line text area',
  },
  {
    type: 'number',
    label: 'Number',
    icon: 'pin',
    category: 'basic',
    description: 'Numeric value (calculations)',
  },
  {
    type: 'boolean',
    label: 'Yes / No',
    icon: 'toggle_on',
    category: 'basic',
    description: 'Boolean toggle',
  },
  {
    type: 'choice',
    label: 'Single choice',
    icon: 'radio_button_checked',
    category: 'basic',
    description: 'One of many (radio)',
  },
  {
    type: 'dropdown',
    label: 'Dropdown',
    icon: 'arrow_drop_down_circle',
    category: 'basic',
    description: 'Select from a list',
  },
  {
    type: 'multiChoice',
    label: 'Multiple choice',
    icon: 'check_box',
    category: 'basic',
    description: 'Pick many (checkboxes)',
  },
  {
    type: 'date',
    label: 'Date',
    icon: 'event',
    category: 'basic',
    description: 'Calendar date picker',
  },
  { type: 'time', label: 'Time', icon: 'schedule', category: 'basic', description: 'Time picker' },
  {
    type: 'dateTime',
    label: 'Date & time',
    icon: 'edit_calendar',
    category: 'basic',
    description: 'Date and time combined',
  },
  {
    type: 'scale',
    label: 'Rating scale',
    icon: 'grade',
    category: 'advanced',
    description: 'N-point scale / rating',
  },
  {
    type: 'file',
    label: 'File upload',
    icon: 'upload_file',
    category: 'advanced',
    description: 'Attachment control',
  },
  {
    type: 'signature',
    label: 'Signature',
    icon: 'draw',
    category: 'advanced',
    description: 'Canvas sign pad (PNG)',
  },
  {
    type: 'group',
    label: 'Group',
    icon: 'folder',
    category: 'layout',
    description: 'Nest questions together',
  },
  {
    type: 'section',
    label: 'Section',
    icon: 'label',
    category: 'layout',
    description: 'Heading divider',
  },
  {
    type: 'textdisplay',
    label: 'Textdisplay',
    icon: 'text_snippet',
    category: 'layout',
    description: 'Shows a text',
  },
];

export function fieldMeta(type: ElementType): FieldTypeMeta {
  return FIELD_TYPES.find((f) => f.type === type) ?? FIELD_TYPES[0];
}
