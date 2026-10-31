import { type TranslationKey } from '../i18n';

/** Translation access for exporters; keeps them framework-free yet localizable. */
export interface ExportContext {
  t(key: TranslationKey, params?: Record<string, string | number>): string;
}
