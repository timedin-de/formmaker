import type { ElementId } from './ids';

export interface FileValue {
  name: string;
  size: number;
  mimeType: string;
  dataUrl?: string;
}

export interface SignatureValue {
  /** PNG data URL of the captured signature. */
  dataUrl: string;
  width: number;
  height: number;
  mimeType: 'image/png';
}

export type DateValue = string; // ISO yyyy-MM-dd
export type TimeValue = string; // HH:mm[:ss]

/** The safe value set a single field may hold. No arbitrary objects. */
export type FieldValue = string | number | boolean | string[] | FileValue[] | SignatureValue | null;

export type ValuesMap = Readonly<Record<ElementId, FieldValue>>;

export type Primitive = string | number | boolean | null;

export function toPrimitive(value: FieldValue): Primitive {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null) return '[attachment]';
  return value as Primitive;
}

/** Values whose array/object payload is thin — safe to spread into stores & events. */
export function isSimpleValue(value: FieldValue): boolean {
  return value === null || typeof value !== 'object';
}
