import { describe, expect, it } from 'vitest';
import { buildColumns, formatValueForExport, buildExportTable } from './columns';
import { toCsv, submissionsToCsv } from './csv-exporter';
import { validateFormDefinition } from './form-schema';
import { newForm, createElement, createPage } from '../state/form-factory';
import type { FormDefinition } from '../../shared/model/form.model';
import type { Submission } from '../../shared/model/submission.model';

function demoForm(): FormDefinition {
  const form = newForm('Demo');
  const p1 = createPage('Details');
  const name = createElement('text', 'Full name');
  const age = createElement('number', 'Age');
  p1.elements = [name, age];
  form.pages = [p1];
  return form;
}

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
    form.pages[0].elements[0].defaultValue = { kind: 'fromField', fieldId: 'q_missing' };
    const issues = validateFormDefinition(form);
    expect(issues.some((i) => i.message.includes('Unknown reference'))).toBe(true);
  });
});
