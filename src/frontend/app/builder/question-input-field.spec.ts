import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
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

  /** Fires the native `change` of the typed input, which bubbles as leaving the input does. */
  function change(): void {
    host()
      .querySelector('input, textarea')!
      .dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Types `value` and commits it. */
  async function commit(input: MatInputHarness, value: string): Promise<void> {
    await input.setValue(value);
    change();
  }

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

    await commit(input, '12.5');
    expect(emitted.at(-1)).toBe(12.5);
    await commit(input, '');
    expect(emitted.at(-1)).toBeNull();
  });

  it('emits a typed value only once its input commits it', async () => {
    show({ type: 'number' }, null);
    const input = await loader().getHarness(MatInputHarness);
    await input.setValue('120');
    expect(emitted).toEqual([]);
    change();
    expect(emitted).toEqual([120]);
  });

  it('drops an uncommitted typed value when the store replaces the value', async () => {
    show({ type: 'number' }, 1);
    const input = await loader().getHarness(MatInputHarness);
    await input.setValue('120');
    // The selection moves to another question while the input keeps focus.
    show({ id: 'other', type: 'number' }, 5);
    change();
    expect(emitted).toEqual([]);
  });

  it('drops an uncommitted typed value when another question with the same value is shown', async () => {
    show({ type: 'number' }, null);
    const input = await loader().getHarness(MatInputHarness);
    await input.setValue('120');
    show({ id: 'other', type: 'number' }, null);
    change();
    expect(emitted).toEqual([]);
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

  it('picks scale values with the runner radio group, and clears them', async () => {
    show({ type: 'scale', min: 1, max: 3, step: 1, minLabel: '', maxLabel: '' } as never, 2);
    await fixture.whenStable();
    const radios = [...host().querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    const shown = (r?: HTMLInputElement) => r?.closest('label')?.textContent?.trim();
    expect(radios.map((r) => shown(r))).toEqual(['1', '2', '3']);
    expect(shown(radios.find((r) => r.checked))).toBe('2');
    // The group is named by the visible label.
    const group = host().querySelector('[role="radiogroup"]')!;
    const title = host().querySelector(`[id="${group.getAttribute('aria-labelledby')}"]`);
    expect(title?.textContent?.trim()).toBe('Value');

    radios[2].click();
    expect(emitted).toEqual([3]);

    await (
      await loader().getHarness(MatButtonHarness.with({ text: i18n.t('value.clear') }))
    ).click();
    expect(emitted).toEqual([3, null]);
  });

  it('enters text with the runner input of the question', async () => {
    show({ type: 'longText' }, 'a');
    const input = await loader().getHarness(MatInputHarness);
    expect(await input.getType()).toBe('textarea');
    await commit(input, 'hello');
    expect(emitted.at(-1)).toBe('hello');
    await commit(input, '');
    expect(emitted.at(-1)).toBeNull();
  });

  it('does not apply the rules of the question to the value', async () => {
    show({ type: 'text', validations: [{ id: 'r', rule: 'maxLength', value: 2 }] } as never, '');
    const input = await loader().getHarness(MatInputHarness);
    expect(await (await input.host()).getAttribute('maxlength')).toBeNull();
  });

  it('picks yes or no for booleans', async () => {
    show({ type: 'boolean' }, 'true');
    const select = await loader().getHarness(MatSelectHarness);
    expect(await select.getValueText()).toBe(i18n.t('value.yes'));
    await select.open();
    await select.clickOptions({ text: i18n.t('value.no') });
    expect(emitted).toEqual([false]);
  });

  it('picks several options of a multi-choice question', async () => {
    const options = [
      { id: 'id-a', label: 'A' },
      { id: 'id-b', label: 'B' },
    ];
    show({ type: 'multiChoice', options } as never, ['id-a']);
    const select = await loader().getHarness(MatSelectHarness);
    expect(await select.isMultiple()).toBe(true);
    expect(await select.getValueText()).toBe('A');
    await select.open();
    await select.clickOptions({ text: 'B' });
    expect(emitted).toEqual([['id-a', 'id-b']]);
  });

  it('keeps a stored value that does not fit visible as text, without rewriting it', async () => {
    show({ type: 'number' }, 'twelve');
    const input = await loader().getHarness(MatInputHarness);
    expect(await input.getType()).toBe('textarea');
    expect(await input.getValue()).toBe('twelve');
    expect(host().textContent).toContain(i18n.t('value.mismatch'));
    expect(emitted).toEqual([]);

    // Applied on commit, so typing does not swap the control under the cursor.
    await input.setValue('12');
    expect(emitted).toEqual([]);
    await (await input.host()).dispatchEvent('change');
    expect(emitted).toEqual([12]);
  });

  it('keeps line breaks of a stored value that does not fit', async () => {
    show({ type: 'number' }, 'first\nsecond');
    const input = await loader().getHarness(MatInputHarness);
    expect(await input.getValue()).toBe('first\nsecond');
  });

  it('shows multi-line text of a single-line question as raw text', async () => {
    show({ type: 'text' }, 'first\nsecond');
    const input = await loader().getHarness(MatInputHarness);
    expect(await input.getType()).toBe('textarea');
    expect(await input.getValue()).toBe('first\nsecond');
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
