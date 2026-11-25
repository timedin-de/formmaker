import path from 'node:path';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

/** Angular's hashed build output: `main-XYMXQVJH.js`, `chunk-DL3cz-5o.js`, `media/font-AB12CD34.woff2`. */
const HASHED_NAME = /-[\w-]{8}\.\w+$/;

/**
 * Cache-Control for a file served from the SPA build, by its path relative to the build folder.
 * Hashed bundles never change under the same name, so browsers may keep them for good. Everything
 * else (`index.html`, `favicon.ico`, `assets/…`) keeps its name across builds and is revalidated.
 */
export function staticCacheControl(relativePath: string): string {
  const parts = relativePath.split(path.sep).join('/').split('/');
  const inHashedFolder = parts.length === 1 || (parts.length === 2 && parts[0] === 'media');
  return inHashedFolder && HASHED_NAME.test(parts.at(-1) ?? '') ? IMMUTABLE : REVALIDATE;
}
