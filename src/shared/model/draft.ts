import type { ValuesMap } from './values.model';

export interface SavedDraft {
  savedAt: number;
  formVersion: number;
  values: ValuesMap;
}
