/** Minimal regex surface the engine needs; satisfied by `RegExp` and by RE2. */
export interface Matcher {
  test(input: string): boolean;
}

export type RegexFactory = (pattern: string, flags: string) => Matcher;

/**
 * The browser uses native `RegExp`. The server swaps in a linear-time engine
 * (RE2) so patterns from form definitions cannot be used for ReDoS.
 */
let factory: RegexFactory = (pattern, flags) => new RegExp(pattern, flags);
const cache = new Map<string, Matcher>();
const CACHE_LIMIT = 500;

export function setRegexFactory(next: RegexFactory): void {
  factory = next;
  cache.clear();
}

/** Compile (and cache) a pattern. Throws like `new RegExp` on invalid patterns. */
export function compileRegex(pattern: string, flags = ''): Matcher {
  const key = `${flags}/${pattern}`;
  let matcher = cache.get(key);
  if (!matcher) {
    matcher = factory(pattern, flags);
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, matcher);
  }
  return matcher;
}
