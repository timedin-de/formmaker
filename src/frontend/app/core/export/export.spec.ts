import { describe, expect, it } from 'vitest';
import { buildColumns, buildColumnBlocks, formatValueForExport, buildExportTable } from './columns';
import { buildReceipt } from './receipt';
import { EXPORT_CHANNELS } from './channels';
import { toCsv, submissionsToCsv } from './csv-exporter';
import { validateFormDefinition } from './form-schema';
import { newForm, createElement, createPage } from '../state/form-factory';
import {
  toPortableForm,
  type FormDefinition,
  type FormWithOwner,
  type QuestionDefinition,
} from '@shared/model/form.model';
import type { Submission } from '@shared/model/submission.model';

function demoForm(): FormDefinition {
  const form = newForm('Demo');
  const p1 = createPage('Details');
  const name = createElement('text', 'Full name');
  const age = createElement('number', 'Age');
  p1.elements = [name, age];
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
    const group = createElement('group', 'Address') as unknown as {
      type: 'group';
      elements: ReturnType<typeof createElement>[];
    };
    group.elements = [createElement('text', 'Street'), createElement('text', 'City')];
    form.pages[0].elements = [group as never];
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
    const group = createElement('group', 'Address') as unknown as {
      type: 'group';
      elements: ReturnType<typeof createElement>[];
    };
    group.elements = [street, city];
    form.pages[0].elements = [group as never];
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
});

describe('toCsv', () => {
  it('escapes commas and quotes', async () => {
    const blob = toCsv(['a', 'b'], [['x, y', 'he said "hi"']]);
    const csv = await blob.text();
    expect(csv).toContain('"x, y"');
    expect(csv).toContain('"he said ""hi"""');
  });
});

describe('submissionsToCsv', () => {
  it('produces header + rows', async () => {
    const form = demoForm();
    const [nameEl, ageEl] = form.pages[0].elements;
    const sub: Submission = {
      id: 's1',
      formId: form.id,
      formName: form.name,
      formVersion: 1,
      submittedAt: '2026-01-01T00:00:00Z',
      durationMs: 1000,
      values: { [nameEl.id]: 'Ada', [ageEl.id]: 36 },
    };
    const blob = submissionsToCsv(form, [sub]);
    const text = await blob.text();
    expect(text).toContain('Full name');
    expect(text).toContain('Ada');
    expect(text).toContain('36');
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
    const group = createElement('group', 'Address') as unknown as {
      type: 'group';
      elements: ReturnType<typeof createElement>[];
    };
    group.elements = [street, city];
    form.pages[0].elements = [group as never];
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
    const group = form.pages[0].elements[0] as { elements: { type: string; id: string }[] };
    group.elements = [
      ...group.elements,
      { type: 'section', id: 'sec_1', heading: 'Remark' } as never,
    ];
    form.pages[0].elements = [
      ...form.pages[0].elements,
      { type: 'group', id: 'g_empty', label: 'Empty group', elements: [] } as never,
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
    const [nameEl, ageEl] = form.pages[0].elements;
    const submissions: Submission[] = [
      {
        id: 's1',
        formId: form.id,
        formName: form.name,
        formVersion: 1,
        submittedAt: '2026-01-01T00:00:00Z',
        durationMs: 1000,
        values: { [nameEl.id]: 'Ada', [ageEl.id]: 36 },
      },
    ];
    expect(EXPORT_CHANNELS.map((c) => c.id)).toEqual(['csv', 'xlsx', 'pdf', 'mail']);
    for (const ch of EXPORT_CHANNELS) {
      const artifact = await ch.build(form, submissions, ctx);
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

describe('validateFormDefinition', () => {
  it('accepts a valid form', () => {
    expect(validateFormDefinition(demoForm())).toEqual([]);
  });

  it('rejects missing pages', () => {
    const issues = validateFormDefinition({ name: 'x' });
    expect(issues.some((i) => i.path === 'pages')).toBe(true);
  });

  it('rejects duplicate element ids', () => {
    const form = demoForm();
    form.pages[0].elements[1].id = form.pages[0].elements[0].id;
    const issues = validateFormDefinition(form);
    expect(issues.some((i) => i.message.includes('Duplicate element id'))).toBe(true);
  });

  it('rejects unknown question type', () => {
    const form = demoForm();
    (form.pages[0].elements[0] as { type: string }).type = 'hologram';
    const issues = validateFormDefinition(form);
    expect(issues.some((i) => i.message.includes('Unknown element type'))).toBe(true);
  });

  it('rejects broken cross-references', () => {
    const form = demoForm();
    (form.pages[0].elements[0] as QuestionDefinition).defaultValue = {
      kind: 'fromField',
      fieldId: 'q_missing',
    };
    const issues = validateFormDefinition(form);
    expect(issues.some((i) => i.message.includes('Unknown reference'))).toBe(true);
  });
});
