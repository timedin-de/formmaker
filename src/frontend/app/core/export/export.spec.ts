import { createElement, createPage } from '@shared/model/form-factory';
import {
  toPortableForm,
  type FormDefinition,
  type FormWithOwner,
  type GroupElement,
  type NamedFormDefinition,
} from '@shared/model/form.model';
import type { Submission } from '@shared/model/submission.model';
import { addToGroup, newForm } from '@test/helper';
import { describe, expect, it } from 'vitest';
import { EXPORT_CHANNELS } from './channels';
import { buildColumnBlocks, buildColumns, buildExportTable, formatValueForExport } from './columns';
import { submissionsToCsv, toCsv } from './csv-exporter';
import { buildReceipt } from './receipt';

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
    const cols = buildColumns(demoForm());
    expect(cols).toHaveLength(2);
    expect(cols[0].label).toContain('Full name');
  });

  it('flattens groups with a path', () => {
    const form = newForm();
    const group = createElement('group', 'Address');
    addToGroup([createElement('text', 'Street'), createElement('text', 'City')], group, form);
    addToGroup(group, form.pages[0], form);
    const cols = buildColumns(form);
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
    expect(buildColumnBlocks(form)).toEqual([
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
    expect(buildColumns(form)).toHaveLength(2);
  });
});

describe('formatValueForExport', () => {
  it('formats kinds of values', () => {
    expect(formatValueForExport(null)).toEqual({ text: '' });
    expect(formatValueForExport('x')).toEqual({ text: 'x' });
    expect(formatValueForExport(3)).toEqual({ text: '3' });
    expect(formatValueForExport(true)).toEqual({ text: 'Yes', additional: { boolean: true } });
    expect(formatValueForExport(false)).toEqual({ text: 'No', additional: { boolean: false } });
    expect(formatValueForExport(['a', 'b'])).toEqual({ text: 'a, b' });
    expect(formatValueForExport([{ name: 'f.pdf', size: 2, mimeType: 'application/pdf' }])).toEqual(
      { text: 'f.pdf' },
    );
    expect(
      formatValueForExport({
        dataUrl: 'data:image/png;base64,AA',
        width: 1,
        height: 1,
        mimeType: 'image/png',
      }),
    ).toMatchObject({ text: '[signature]' });
  });

  it('shows option labels instead of ids for choice answers', () => {
    const choice = createElement('multiChoice', 'Pick');
    if (choice.type !== 'multiChoice') throw new Error('expected multiChoice');
    const [a, b] = choice.options;
    expect(formatValueForExport(a.id, choice)).toEqual({ text: 'Option 1' });
    expect(formatValueForExport([a.id, b.id], choice)).toEqual({ text: 'Option 1, Option 2' });
    expect(formatValueForExport('gone', choice)).toEqual({ text: '[removed option]' });
    expect(formatValueForExport(null, choice)).toEqual({ text: '' });
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
    const blob = submissionsToCsv(form, [sub]);
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
    const text = await submissionsToCsv(form, [sub]).text();
    expect(text).toContain('Option 2');
    expect(text).not.toContain(option.id);
  });
});

describe('buildExportTable', () => {
  it('maps submissions to rows', () => {
    const form = demoForm();
    const table = buildExportTable(form, []);
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
    const blocks = buildReceipt(form, submissionFor(form, { [street.id]: 'Main 1' }));
    expect(blocks).toEqual([
      { kind: 'page', label: 'New page', indent: 0 },
      { kind: 'group', label: 'Address', indent: 0 },
      { kind: 'answer', label: 'Street', value: 'Main 1', indent: 1 },
    ]);
    expect(blocks.some((b) => b.kind === 'group')).toBe(true);
    expect(blocks.some((b) => b.label === 'City')).toBe(false);
    expect(blocks.some((b) => b.label === 'Empty group')).toBe(false);
  });
});

describe('EXPORT_CHANNELS', () => {
  const ctx = { t: (key: string) => key };

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
