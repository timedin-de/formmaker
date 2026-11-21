import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import type { ElementDefinition } from '@shared/model/form.model';
import type { FieldValue } from '@shared/model/values.model';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nService } from '../core/i18n';
import { QuestionInputField } from './question-input-field';

describe('QuestionInputField', () => {
  let fixture: ComponentFixture<QuestionInputField>;
  let i18n: I18nService;
  let emitted: FieldValue[];

  const loader = () => TestbedHarnessEnvironment.loader(fixture);
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function show(element: Partial<ElementDefinition> & { type: string }, value: unknown): void {
    fixture.componentRef.setInput('element', { id: 'q', ...element } as ElementDefinition);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('label', 'Value');
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuestionInputField],
      providers: [I18nService],
    }).compileComponents();

    i18n = TestBed.inject(I18nService);
    fixture = TestBed.createComponent(QuestionInputField);
    emitted = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
  });

  it('enters numbers with a number input and emits numbers', async () => {
    show({ type: 'number', unit: 'kg' }, 4);
    const input = await loader().getHarness(MatInputHarness);
    expect(await input.getType()).toBe('number');
    expect(await input.getValue()).toBe('4');
    expect(host().textContent).toContain('kg');

    await input.setValue('12.5');
    expect(emitted.at(-1)).toBe(12.5);
    await input.setValue('');
    expect(emitted.at(-1)).toBeNull();
  });

  it.each([
    ['date', 'date', '2026-11-21'],
    ['time', 'time', '09:30'],
    ['dateTime', 'datetime-local', '2026-11-21T09:30'],
  ])('enters %s values with a %s input', async (type, inputType, value) => {
    show({ type, timeInterval: { value: 1, multiplier: '60' } } as never, value);
    const input = await loader().getHarness(MatInputHarness);
    expect(await input.getType()).toBe(inputType);
    expect(await input.getValue()).toBe(value);
  });

  it('picks scale values from the scale steps', async () => {
    show({ type: 'scale', min: 1, max: 3, step: 1 } as never, 2);
    const select = await loader().getHarness(MatSelectHarness);
    expect(await select.getValueText()).toBe('2');
    await select.open();
    const labels = await Promise.all((await select.getOptions()).map((o) => o.getText()));
    expect(labels).toEqual([i18n.t('panel.none'), '1', '2', '3']);
    await select.clickOptions({ text: '3' });
    expect(emitted).toEqual([3]);
  });

  it('picks yes or no for booleans', async () => {
    show({ type: 'boolean' }, 'true');
    const select = await loader().getHarness(MatSelectHarness);
    expect(await select.getValueText()).toBe(i18n.t('value.yes'));
    await select.open();
    await select.clickOptions({ text: i18n.t('value.no') });
    expect(emitted).toEqual([false]);
  });

  it('picks options by label, a single one when asked to', async () => {
    const options = [
      { id: 'id-a', label: 'A' },
      { id: 'id-b', label: 'B' },
    ];
    fixture.componentRef.setInput('single', true);
    show({ type: 'multiChoice', options } as never, 'id-a');
    const select = await loader().getHarness(MatSelectHarness);
    expect(await select.isMultiple()).toBe(false);
    expect(await select.getValueText()).toBe('A');
    await select.open();
    await select.clickOptions({ text: 'B' });
    expect(emitted).toEqual(['id-b']);
  });

  it('keeps a stored value that does not fit visible as text, without rewriting it', async () => {
    show({ type: 'number' }, 'twelve');
    const input = await loader().getHarness(MatInputHarness);
    expect(await input.getType()).toBe('text');
    expect(await input.getValue()).toBe('twelve');
    expect(host().textContent).toContain(i18n.t('value.mismatch'));
    expect(emitted).toEqual([]);

    // Applied on commit, so typing does not swap the control under the cursor.
    await input.setValue('12');
    expect(emitted).toEqual([]);
    await (await input.host()).dispatchEvent('change');
    expect(emitted).toEqual([12]);
  });

  it('explains that files and signatures have no fixed value', () => {
    show({ type: 'signature' }, null);
    expect(host().textContent).toContain(i18n.t('value.unsupported'));
    expect(host().querySelector('input')).toBeNull();
  });

  it('uses the kind override, e.g. date bounds of a dateTime question', async () => {
    fixture.componentRef.setInput('kind', 'date');
    show({ type: 'dateTime' }, '2026-01-01');
    const input = await loader().getHarness(MatInputHarness);
    expect(await input.getType()).toBe('date');
  });
});
