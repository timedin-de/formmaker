import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import type { ChoiceOption } from '@shared/model/form.model';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nService } from '../core/i18n';
import { OptionPicker } from './option-picker';

const options: ChoiceOption[] = [
  { id: 'id-blue', label: 'Blue' },
  { id: 'id-green', label: 'Green' },
];

describe('OptionPicker', () => {
  let fixture: ComponentFixture<OptionPicker>;
  let i18n: I18nService;
  let emitted: (string | string[] | null)[];

  async function select(): Promise<MatSelectHarness> {
    return TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OptionPicker],
      providers: [I18nService],
    }).compileComponents();

    i18n = TestBed.inject(I18nService);
    fixture = TestBed.createComponent(OptionPicker);
    fixture.componentRef.setInput('options', options);
    emitted = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
  });

  it('shows labels and emits the picked option id', async () => {
    const harness = await select();
    await harness.open();
    const labels = await Promise.all((await harness.getOptions()).map((o) => o.getText()));
    expect(labels).toEqual([i18n.t('panel.none'), 'Blue', 'Green']);

    await harness.clickOptions({ text: 'Green' });
    expect(emitted).toEqual(['id-green']);
  });

  it('shows the label of the selected id and emits null for none', async () => {
    fixture.componentRef.setInput('value', 'id-blue');
    const harness = await select();
    expect(await harness.getValueText()).toBe('Blue');

    await harness.open();
    await harness.clickOptions({ text: i18n.t('panel.none') });
    expect(emitted).toEqual([null]);
  });

  it('emits all picked ids in multiple mode', async () => {
    fixture.componentRef.setInput('multiple', true);
    fixture.componentRef.setInput('value', ['id-blue']);
    const harness = await select();
    expect(await harness.isMultiple()).toBe(true);

    await harness.open();
    await harness.clickOptions({ text: 'Green' });
    expect(emitted).toEqual([['id-blue', 'id-green']]);
  });

  it('lists selected ids of removed options so they can be deselected', async () => {
    fixture.componentRef.setInput('multiple', true);
    fixture.componentRef.setInput('value', ['gone', 'id-blue']);
    const harness = await select();
    const removed = i18n.t('panel.removedOption');
    expect(await harness.getValueText()).toContain(removed);

    await harness.open();
    await harness.clickOptions({ text: removed });
    expect(emitted).toEqual([['id-blue']]);
  });

  it('ignores non-string values', async () => {
    fixture.componentRef.setInput('value', 1);
    const harness = await select();
    expect(await harness.getValueText()).toBe('');
  });
});
