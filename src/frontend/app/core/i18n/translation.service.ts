import { Injectable, signal } from '@angular/core';
import type { Lang } from './translations';
import { SUPPORTED_LANGS, TRANSLATIONS } from './translations';
import { catchFn } from '@shared/helper';

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
