import { catchFn } from '@shared/helper';
import z from 'zod';

export const FORMS_CACHE_KEY = 'formmaker.cache.forms.v1';
export const FORM_CACHE_PREFIX = 'formmaker.cache.form.v1.';
export const SUBMISSIONS_CACHE_PREFIX = 'formmaker.cache.submissions.v1.';

export const FORMS_CACHE_TTL_MS = 60_000;
export const SUBMISSIONS_CACHE_TTL_MS = 30_000;

interface CacheEntry<T> {
  cachedAt: number;
  value: T;
}

export function readCache<T>(schema: z.ZodType<T>, key: string, maxAgeMs: number): T | null {
  const { data: entry } = catchFn(
    () => JSON.parse(localStorage.getItem(key) ?? 'null') as CacheEntry<T> | null,
  );
  return entry && Date.now() - entry.cachedAt < maxAgeMs ? entry.value : null;
}

export function writeCache<T>(key: string, value: T): void {
  catchFn(() =>
    localStorage.setItem(
      key,
      JSON.stringify({ cachedAt: Date.now(), value } satisfies CacheEntry<T>),
    ),
  );
}

export function removeCache(key: string): void {
  catchFn(() => localStorage.removeItem(key));
}

/** Drop cached API responses when the authenticated user changes. */
export function clearApiCache(): void {
  catchFn(() => {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('formmaker.cache.')) localStorage.removeItem(key);
    }
  });
}
