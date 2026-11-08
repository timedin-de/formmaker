import { createElement, createPage } from '@shared/model/form-factory';
import {
  toPortableForm,
  type FormDefinition,
  type FormWithOwner,
  type GroupElement,
  type NamedFormDefinition,
} from '@shared/model/form.model';
import type { Submission } from '@shared/model/submission.model';
import type { FieldValue } from '@shared/model/values.model';
import { addToGroup, newForm } from '@test/helper';
import { describe, expect, it } from 'vitest';
import { EXPORT_CHANNELS } from './channels';
import { buildColumnBlocks, buildColumns, buildExportTable, formatValueForExport } from './columns';
import { submissionsToCsv, toCsv } from './csv-exporter';
import de from '../i18n/lang/de';
import en from '../i18n/lang/en';
import type { ExportContext } from './context';
import { submissionsToPdf, submissionToPdf } from './pdf-exporter';
import { buildReceipt } from './receipt';

/** Translates every key to itself. */
const ctx: ExportContext = { t: (key) => key };

/** Translates with a real dictionary, filling in `{param}` placeholders. */
const ctxFor = (dict: Record<string, string>): ExportContext => ({
  t: (key, params) =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) => String(params?.[name] ?? m)),
});

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function demoForm(): FormDefinition {
  const form = newForm('Demo');
  const p1 = createPage('Details');
  const name = createElement('text', 'Full name');
  const age = createElement('number', 'Age');
  addToGroup([name, age], p1, form);
  form.pages = [p1];
  return form;
}

describe('toPortableForm', () => {
  it('removes ownership metadata before export', () => {
    const form = {
      ...demoForm(),
      ownerId: 'owner-1',
      owner: {
        id: 'owner-1',
        email: 'owner@example.test',
        role: 'editor',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    } as FormWithOwner;

    const portable = toPortableForm(form);

    expect(portable).not.toHaveProperty('ownerId');
    expect(portable).not.toHaveProperty('owner');
  });
});

describe('buildColumns', () => {
  it('flattens questions into columns', () => {
    const cols = buildColumns(demoForm(), ctx);
    expect(cols).toHaveLength(2);
    expect(cols[0].label).toContain('Full name');
  });

  it('flattens groups with a path', () => {
    const form = newForm();
    const group = createElement('group', 'Address');
    addToGroup([createElement('text', 'Street'), createElement('text', 'City')], group, form);
    addToGroup(group, form.pages[0], form);
    const cols = buildColumns(form, ctx);
    expect(cols.map((c) => c.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('Street'), expect.stringContaining('City')]),
    );
  });
});

describe('buildColumnBlocks', () => {
  it('keeps group headings in order with nested fields', () => {
    const form = newForm();
    const street = createElement('text', 'Street');
    const city = createElement('text', 'City');
    const group = createElement('group', 'Address');
    addToGroup([street, city], group, form);
    addToGroup(group, form.pages[0], form);
    expect(buildColumnBlocks(form, ctx)).toEqual([
      { kind: 'page', label: 'New page', indent: 0 },
      { kind: 'group', label: 'Address', indent: 0 },
      {
        kind: 'field',
        column: {
          fieldId: street.id,
          label: expect.stringContaining('Street') as unknown as string,
        },
      },
      {
        kind: 'field',
        column: { fieldId: city.id, label: expect.stringContaining('City') as unknown as string },
      },
    ]);
    expect(buildColumns(form, ctx)).toHaveLength(2);
  });

  it('labels untitled pages in the export language', () => {
    const form = demoForm();
    form.pages[0].title = '  ';
    expect(buildColumnBlocks(form, ctxFor(de))[0]).toEqual({
      kind: 'page',
      label: 'Seite 1',
      indent: 0,
    });
  });
});

describe('formatValueForExport', () => {
  it('formats kinds of values', () => {
    const format = (value: FieldValue): { text: string } =>
      formatValueForExport(value, undefined, ctx);
    expect(format(null)).toEqual({ text: '' });
    expect(format('x')).toEqual({ text: 'x' });
    expect(format(3)).toEqual({ text: '3' });
    expect(format(true)).toEqual({ text: 'export.yes', additional: { boolean: true } });
    expect(format(false)).toEqual({ text: 'export.no', additional: { boolean: false } });
    expect(format(['a', 'b'])).toEqual({ text: 'a, b' });
    expect(format([{ name: 'f.pdf', size: 2, mimeType: 'application/pdf' }])).toEqual({
      text: 'f.pdf',
    });
    expect(
      format({ dataUrl: 'data:image/png;base64,AA', width: 1, height: 1, mimeType: 'image/png' }),
    ).toMatchObject({ text: 'export.signature' });
  });

  it('shows option labels instead of ids for choice answers', () => {
    const choice = createElement('multiChoice', 'Pick');
    if (choice.type !== 'multiChoice') throw new Error('expected multiChoice');
    const [a, b] = choice.options;
    expect(formatValueForExport(a.id, choice, ctx)).toEqual({ text: 'Option 1' });
    expect(formatValueForExport([a.id, b.id], choice, ctx)).toEqual({
      text: 'Option 1, Option 2',
    });
    expect(formatValueForExport('gone', choice, ctx)).toEqual({ text: 'export.removedOption' });
    expect(formatValueForExport(null, choice, ctx)).toEqual({ text: '' });
  });
});

describe('toCsv', () => {
  it('escapes commas and quotes', async () => {
    const blob = toCsv(['a', 'b'], [['x, y', 'he said "hi"']]);
    const csv = await blob.text();
    expect(csv).toContain('"x, y"');
    expect(csv).toContain('"he said ""hi"""');
  });

  it('neutralizes formula cells but keeps numbers', async () => {
    const blob = toCsv(['a'], [['=1+1'], ['@SUM(A1)'], ['-5'], ['+2.5']]);
    const csv = await blob.text();
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).toContain('\r\n-5\r\n');
    expect(csv).toContain('\r\n+2.5');
    expect(csv).not.toContain("'-5");
  });
});

describe('submissionsToCsv', () => {
  it('produces header + rows', async () => {
    const form = demoForm();
    const [nameEl, ageEl] = form.pages[0].children;
    const sub: Submission = {
      id: 's1',
      formId: form.id,
      formVersion: 1,
      submittedAt: '2026-01-01T00:00:00Z',
      durationMs: 1000,
      values: { [nameEl]: 'Ada', [ageEl]: 36 },
    };
    const blob = submissionsToCsv(form, [sub], ctx);
    const text = await blob.text();
    expect(text).toContain('Full name');
    expect(text).toContain('Ada');
    expect(text).toContain('36');
  });

  it('writes choice answers as option labels', async () => {
    const form = newForm();
    const choice = createElement('dropdown', 'Color');
    if (choice.type !== 'dropdown') throw new Error('expected dropdown');
    addToGroup(choice, form.pages[0], form);
    const option = choice.options[1];
    const sub: Submission = {
      id: 's1',
      formId: form.id,
      formVersion: 1,
      submittedAt: '2026-01-01T00:00:00Z',
      durationMs: 1000,
      values: { [choice.id]: option.id },
    };
    const text = await submissionsToCsv(form, [sub], ctx).text();
    expect(text).toContain('Option 2');
    expect(text).not.toContain(option.id);
  });
});

describe('buildExportTable', () => {
  it('maps submissions to rows', () => {
    const form = demoForm();
    const table = buildExportTable(form, [], ctx);
    expect(table.columns).toHaveLength(2);
  });
});

describe('buildReceipt', () => {
  function formWithGroup(): {
    form: FormDefinition;
    street: ReturnType<typeof createElement>;
    city: ReturnType<typeof createElement>;
  } {
    const form = newForm();
    const street = createElement('text', 'Street');
    const city = createElement('text', 'City');
    const group = createElement('group', 'Address');
    addToGroup([street, city], group, form);
    addToGroup(group, form.pages[0], form);

    return { form, street, city };
  }

  function submissionFor(form: FormDefinition, values: Record<string, unknown>): Submission {
    return {
      id: 's1',
      formId: form.id,
      formName: form.name,
      formVersion: 1,
      submittedAt: '2026-01-01T00:00:00Z',
      values,
    } as unknown as Submission;
  }

  it('emits group headings with nested answers indented', () => {
    const { form, street, city } = formWithGroup();
    const blocks = buildReceipt(
      form,
      submissionFor(form, { [street.id]: 'Main 1', [city.id]: 'Oslo' }),
      ctx,
    );
    expect(blocks).toEqual([
      { kind: 'page', label: 'New page', indent: 0 },
      { kind: 'group', label: 'Address', indent: 0 },
      { kind: 'answer', label: 'Street', value: 'Main 1', indent: 1 },
      { kind: 'answer', label: 'City', value: 'Oslo', indent: 1 },
    ]);
  });

  it('skips empty groups, sections and unanswered questions', () => {
    const { form, street } = formWithGroup();
    const group = form.elements[form.pages[0].children[0]] as GroupElement;
    group.children = [
      ...group.children,
      { type: 'section', id: 'sec_1', heading: 'Remark' } as never,
    ];
    form.pages[0].children = [
      ...form.pages[0].children,
      { type: 'group', id: 'g_empty', label: 'Empty group', children: [] } as never,
    ];
    const blocks = buildReceipt(form, submissionFor(form, { [street.id]: 'Main 1' }), ctx);
    expect(blocks).toEqual([
      { kind: 'page', label: 'New page', indent: 0 },
      { kind: 'group', label: 'Address', indent: 0 },
      { kind: 'answer', label: 'Street', value: 'Main 1', indent: 1 },
    ]);
    expect(blocks.some((b) => b.kind === 'group')).toBe(true);
    expect(blocks.some((b) => b.label === 'City')).toBe(false);
    expect(blocks.some((b) => b.label === 'Empty group')).toBe(false);
  });

  it('passes the signature image through as additional data', () => {
    const form = newForm();
    const sign = createElement('signature', 'Sign here');
    addToGroup(sign, form.pages[0], form);
    const signature = { dataUrl: PNG_1X1, width: 1, height: 1, mimeType: 'image/png' };
    const blocks = buildReceipt(form, submissionFor(form, { [sign.id]: signature }), ctx);
    expect(blocks[1]).toEqual({
      kind: 'answer',
      label: 'Sign here',
      value: 'export.signature',
      indent: 0,
      additional: { dataUrl: PNG_1X1 },
    });
  });
});

describe('submissionToPdf', () => {
  function signedSubmission(dataUrl: string): { form: NamedFormDefinition; sub: Submission } {
    const form = newForm('Signed') as NamedFormDefinition;
    const sign = createElement('signature', 'Sign here');
    addToGroup(sign, form.pages[0], form);
    const sub: Submission = {
      id: 's1',
      formId: form.id,
      formVersion: 1,
      submittedAt: '2026-01-01T00:00:00Z',
      durationMs: 1000,
      values: { [sign.id]: { dataUrl, width: 1, height: 1, mimeType: 'image/png' } },
    };
    return { form, sub };
  }

  it('renders a signature image', async () => {
    const { form, sub } = signedSubmission(PNG_1X1);
    const blob = await submissionToPdf(form, sub, ctx);
    expect(blob.type).toBe('application/pdf');
    expect(await blob.text()).toContain('/Subtype /Image');
  });

  it('falls back to text when the signature image is unreadable', async () => {
    const { form, sub } = signedSubmission('data:image/png;base64,AAAA');
    const blob = await submissionToPdf(form, sub, ctx);
    expect(await blob.text()).not.toContain('/Subtype /Image');
  });
});

describe('submissionsToPdf', () => {
  function timedSubmission(form: FormDefinition): Submission {
    const [nameEl] = form.pages[0].children;
    return {
      id: 's1',
      formId: form.id,
      formVersion: 1,
      submittedAt: '2026-01-01T00:00:00Z',
      durationMs: 65_000,
      values: { [nameEl]: 'Ada' },
    };
  }

  /** Text runs of an (uncompressed) PDF, with their y position (bottom-up). */
  function textRuns(pdf: string): { y: number; text: string }[] {
    return [...pdf.matchAll(/[\d.]+ ([\d.]+) Td\n\((.*?)\) Tj/g)].map((m) => ({
      y: Number(m[1]),
      text: m[2],
    }));
  }

  it('keeps the duration line clear of the first page heading', async () => {
    const form = demoForm() as NamedFormDefinition;
    const pdf = await (await submissionsToPdf(form, [timedSubmission(form)], ctxFor(en))).text();
    // take the last match, since the page heading also appears earlier in the summary table
    const yOf = (label: string): number => {
      const last = textRuns(pdf)
        .filter((r) => r.text === label)
        .at(-1);
      if (!last) throw new Error(`no text "${label}" in pdf`);
      return last.y;
    };
    expect(yOf('Duration: 1m 5s') - yOf('Details')).toBeGreaterThanOrEqual(14);
  });

  it('uses the given language for its labels', async () => {
    const form = demoForm() as NamedFormDefinition;
    const pdf = await (await submissionsToPdf(form, [timedSubmission(form)], ctxFor(de))).text();
    const texts = textRuns(pdf).map((r) => r.text);
    expect(texts).toEqual(expect.arrayContaining(['Feld', 'Beantwortet', 'Dauer: 1 min 5 s']));
    expect(texts).not.toContain('Field');
  });
});

describe('EXPORT_CHANNELS', () => {
  it('registers download channels for csv, xlsx, pdf and a link channel for mail', async () => {
    const form = demoForm();
    const [nameEl, ageEl] = form.pages[0].children;
    const submissions: Submission[] = [
      {
        id: 's1',
        formId: form.id,
        formVersion: 1,
        submittedAt: '2026-01-01T00:00:00Z',
        durationMs: 1000,
        values: { [nameEl]: 'Ada', [ageEl]: 36 },
      },
    ];
    expect(EXPORT_CHANNELS.map((c) => c.id)).toEqual(['csv', 'xlsx', 'pdf', 'mail']);
    for (const ch of EXPORT_CHANNELS) {
      const artifact = await ch.build(form as NamedFormDefinition, submissions, ctx);
      expect(artifact.kind).toBe(ch.id === 'mail' ? 'link' : 'download');
      if (artifact.kind === 'download') {
        expect(artifact.filename).toMatch(/\.(csv|xlsx|pdf)$/);
        expect(artifact.blob).toBeInstanceOf(Blob);
      } else {
        expect(artifact.url.startsWith('mailto:')).toBe(true);
      }
    }
  });
});
