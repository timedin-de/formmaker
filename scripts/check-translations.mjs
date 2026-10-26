import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');
const langDir = join(srcDir, 'frontend/app/core/i18n/lang');
const langs = ['en', 'de'];

/** Keys of a language file: every `'key': ...` at the start of a line. */
function readKeys(lang) {
  const text = readFileSync(join(langDir, `${lang}.ts`), 'utf8');
  return new Set([...text.matchAll(/^\s*'([^']+)'\s*:/gm)].map((m) => m[1]));
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path === langDir ? [] : sourceFiles(path);
    const isSource = /\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts');
    return isSource ? [path] : [];
  });
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const keysByLang = Object.fromEntries(langs.map((lang) => [lang, readKeys(lang)]));
const allKeys = new Set(langs.flatMap((lang) => [...keysByLang[lang]]));

const literals = new Set();
/** Template literals like `field.${type}.desc` become patterns that cover every matching key. */
const patterns = [];
for (const file of sourceFiles(srcDir)) {
  const text = readFileSync(file, 'utf8');
  // Each quote style is scanned on its own so strings nested in others are found too,
  // e.g. `[label]="i18n.t('login.email')"` in templates.
  for (const m of text.matchAll(/'([^'\n]+)'/g)) if (allKeys.has(m[1])) literals.add(m[1]);
  for (const m of text.matchAll(/"([^"\n]+)"/g)) if (allKeys.has(m[1])) literals.add(m[1]);
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    if (allKeys.has(m[1])) literals.add(m[1]);
    if (m[1].includes('${')) {
      const parts = m[1].split(/\$\{[^}]*\}/);
      if (parts.join('') === '') continue; // only placeholders, matches anything
      const source = `^${parts.map(escapeRegex).join('.+')}$`;
      patterns.push({ regex: new RegExp(source), where: relative(root, file) });
    }
  }
}

const isUsed = (key) =>
  literals.has(key) ||
  // Plural forms: `${unit.key}${n === 1 ? '' : 's'}`
  (key.endsWith('s') && literals.has(key.slice(0, -1))) ||
  patterns.some(({ regex }) => regex.test(key));

let problems = 0;
const unused = [...allKeys].filter((key) => !isUsed(key)).sort();
if (unused.length > 0) {
  problems += unused.length;
  console.error(`Unused translation keys (${unused.length}):`);
  for (const key of unused) console.error(`  ${key}`);
}

for (const lang of langs) {
  const missing = [...allKeys].filter((key) => !keysByLang[lang].has(key)).sort();
  if (missing.length === 0) continue;
  problems += missing.length;
  console.error(`Keys missing in ${lang}.ts (${missing.length}):`);
  for (const key of missing) console.error(`  ${key}`);
}

if (problems > 0) process.exit(1);
console.log(`All ${allKeys.size} translation keys are used and present in ${langs.join(', ')}.`);
