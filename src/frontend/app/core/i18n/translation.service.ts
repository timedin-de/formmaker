import { DOCUMENT } from '@angular/common';
import {
  effect,
  type EnvironmentProviders,
  inject,
  Injectable,
  isDevMode,
  provideAppInitializer,
  signal,
} from '@angular/core';
import { type ValidationErrors } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchFn } from '@shared/helper';
import * as z from 'zod/mini';
import { SNACK_TIME_ERROR } from '../consts';
import type en from './lang/en';

const STORAGE_KEY = 'formmaker.lang';
export const TRANSLATIONS_CACHE_PREFIX = 'formmaker.i18n.';

export const SUPPORTED_LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
];

/** Each language is its own lazy chunk, so only the active one is downloaded. */
const LOADERS: Record<Lang, () => Promise<{ default: Dict }>> = {
  en: () => import('./lang/en'),
  de: () => import('./lang/de'),
};

/**
 * Identifies the build: this module's bundle URL carries a content hash that changes whenever a
 * language chunk changes. Dev bundles are unhashed, so caching is off there.
 */
const BUILD_VERSION = isDevMode() ? null : import.meta.url;

/**
 * Tiny dependency-free i18n service: English + German, falls back to the key.
 * Only the active language's dictionary is loaded; see `provideI18n`.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly current = signal<Lang>(readInitial());
  private readonly dict = signal<Dict>({});
  private requested: Lang = this.current();
  private snack = inject(MatSnackBar);

  readonly lang = this.current.asReadonly();

  constructor() {
    const document = inject(DOCUMENT);
    effect(() => document.documentElement.setAttribute('lang', this.lang()));
  }

  /** Loads the dictionary for the initial language. */
  init(): Promise<void> {
    return this.setLang(this.current(), false);
  }

  /** Reactive translate: reads the dictionary signal so template calls re-render on switch. */
  t(key: TranslationKey, params?: Record<string, string | number>): string {
    const text = this.dict()[key] ?? key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) => {
      return name in (params as object) ? String(params[name as keyof typeof params]) : match;
    });
  }
  error(error?: ValidationErrors | null) {
    if (!error) return '';
    const [errorKey, params] = getErrorKey(error);
    if (!errorKey) return '';
    return this.t(errorKey, params);
  }

  /** Switches once the dictionary has loaded, so the UI never shows bare keys. */
  async setLang(lang: Lang, persist = true): Promise<void> {
    this.requested = lang;
    let dict: Dict;
    try {
      dict = await loadTranslations(lang);
    } catch (error) {
      // Uses the still-active dictionary; falls back to the key if none has loaded yet.
      this.snack.open(this.t('errors.translationsLoad', { lang }), 'OK', {
        duration: SNACK_TIME_ERROR,
      });
      console.error(`Failed to load "${lang}" translations`, error);
      return;
    }

    // A later call won the race; drop this result.
    if (this.requested !== lang) return;
    this.dict.set(dict);
    this.current.set(lang);
    if (persist) catchFn(() => localStorage.setItem(STORAGE_KEY, lang));
  }

  toggle(): Promise<void> {
    return this.setLang(this.lang() === 'en' ? 'de' : 'en');
  }

  readonly supported = SUPPORTED_LANGS;
}

/** Blocks bootstrap until the active language's dictionary is available. */
export function provideI18n(): EnvironmentProviders {
  return provideAppInitializer(() => inject(I18nService).init());
}

function readInitial(): Lang {
  const { data: stored } = catchFn(() => localStorage.getItem(STORAGE_KEY));
  if (stored === 'de' || stored === 'en') return stored;
  const browser = typeof navigator !== 'undefined' ? navigator.language : '';
  return browser.toLowerCase().startsWith('de') ? 'de' : 'en';
}
export function getErrorKey(
  errors: ValidationErrors | null,
): [TranslationKey, Record<string, string>?] | [undefined] {
  if (!errors) return [undefined];
  if (errors['required']) return ['errors.required'];
  if (errors['minlength'])
    return ['errors.minLength', { detail: errors['minlength'].requiredLength }];
  if (errors['passwordMismatch']) return ['errors.passwordMismatch'];
  if (errors['email']) return ['errors.email'];
  return [undefined];
}

/** Loads a dictionary, preferring the localStorage copy written by the same build. */
export async function loadTranslations(
  lang: Lang,
  version: string | null = BUILD_VERSION,
): Promise<Dict> {
  const key = TRANSLATIONS_CACHE_PREFIX + lang;
  if (version) {
    const { data: cached } = catchFn(() =>
      cacheSchema.parse(JSON.parse(localStorage.getItem(key) ?? '')),
    );
    if (cached?.version === version) return cached.dict;
  }

  const dict = (await LOADERS[lang]()).default;
  if (version) {
    catchFn(() => localStorage.setItem(key, JSON.stringify({ version, dict })));
  }
  return dict;
}

type Lang = 'en' | 'de';
type Dict = Record<string, string>;
export type TranslationKey = keyof typeof en;
const cacheSchema = z.strictObject({
  version: z.string(),
  dict: z.record(z.string(), z.string()),
});
