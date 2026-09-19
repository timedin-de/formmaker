import { Injectable, signal } from '@angular/core';
import { ValidationErrors } from '@angular/forms';
import { catchFn } from '@shared/helper';
import type { Lang, TranslationKey } from './translations';
import { SUPPORTED_LANGS, TRANSLATIONS } from './translations';

const STORAGE_KEY = 'formmaker.lang';

/** Tiny dependency-free i18n service: English + German, falls back to the key. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(readInitial());

  /** Reactive translate: reads `this.lang()` so template calls re-render on switch. */
  t(key: string, params?: Record<string, string | number>): string {
    const text = TRANSLATIONS[this.lang()][key] ?? TRANSLATIONS.en[key] ?? key;
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

  setLang(lang: Lang): void {
    this.lang.set(lang);
    catchFn(() => localStorage.setItem(STORAGE_KEY, lang));
  }

  toggle(): void {
    this.setLang(this.lang() === 'en' ? 'de' : 'en');
  }

  readonly supported = SUPPORTED_LANGS;
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
    return ['errors.minLength', { requiredLength: errors['minlength'].requiredLength }];
  if (errors['passwordMismatch']) return ['errors.passwordMismatch'];
  if (errors['email']) return ['errors.email'];
  return [undefined];
}
