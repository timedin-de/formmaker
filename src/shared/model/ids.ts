export type ElementId = string;
export type PageId = string;
export type FormId = string;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function elementId(prefix: 'q' | 'submission' | 'page'): ElementId {
  return `${prefix}_${uuid()}`;
}
