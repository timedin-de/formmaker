import { mkdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'node_modules/@material-design-icons/svg/filled');
const outDir = join(root, 'public/assets/icons');
const manifestFile = join(root, 'src/app/core/icon-names.ts');

const icons = [
  'account_tree',
  'add',
  'add_circle_outline',
  'arrow_back',
  'arrow_downward',
  'arrow_drop_down_circle',
  'arrow_forward',
  'arrow_upward',
  'attach_file',
  'bar_chart',
  'check',
  'check_box',
  'close',
  'content_copy',
  'delete_outline',
  'delete_sweep',
  'description',
  'download',
  'draw',
  'edit',
  'edit_calendar',
  'event',
  'folder',
  'gesture',
  'grade',
  'inbox',
  'label',
  'language',
  'link',
  'lock',
  'lock_open',
  'login',
  'logout',
  'mail',
  'note_add',
  'notes',
  'pin',
  'picture_as_pdf',
  'play_arrow',
  'play_circle_outline',
  'quiz',
  'radio_button_checked',
  'refresh',
  'save',
  'schedule',
  'send',
  'short_text',
  'table_view',
  'toggle_on',
  'upload_file',
  'view_agenda',
  'view_column',
  'text_snippet',
];

mkdirSync(outDir, { recursive: true });
const missing = [];
for (const name of icons) {
  const source = join(srcDir, `${name}.svg`);
  if (!existsSync(source)) {
    missing.push(name);
    continue;
  }
  copyFileSync(source, join(outDir, `${name}.svg`));
}

writeFileSync(
  manifestFile,
  `export const ICON_NAMES = ${JSON.stringify(icons, null, 2)} as const;\nexport type IconName = typeof ICON_NAMES[number];\n`,
);

if (missing.length > 0) {
  console.error(`Missing icons: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`Copied ${icons.length} icons to ${outDir}`);
console.log(`Wrote ${manifestFile}`);
