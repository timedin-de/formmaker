import { describe, expect, it } from 'vitest';
import { staticCacheControl } from './static-cache.js';

describe('staticCacheControl', () => {
  it.each([
    'main-XYMXQVJH.js',
    'chunk-DL3cz-5o.js',
    'styles-FO46CQTN.css',
    'media/font-AB12CD34.woff2',
  ])('lets browsers keep hashed build output %s', (file) => {
    expect(staticCacheControl(file)).toBe('public, max-age=31536000, immutable');
  });

  it.each([
    'index.html',
    'favicon.ico',
    'assets/icons/delete_outline.svg',
    'assets/x/chunk-AB12CD34.js',
  ])('revalidates %s, whose name stays the same across builds', (file) => {
    expect(staticCacheControl(file)).toBe('no-cache');
  });
});
