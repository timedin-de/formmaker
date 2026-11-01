import { booleanAttribute, Component, computed, inject, input, output } from '@angular/core';
import { MatSelectModule } from '@angular/material/select';
import type { ChoiceOption } from '@shared/model/form.model';
import { I18nService } from '../core/i18n';

/**
 * Picks options of a choice question by label and emits their ids. Selected ids that no longer
 * match an option are listed as removed so they stay visible and can be deselected.
 */
@Component({
  selector: 'fm-option-picker',
  templateUrl: './option-picker.html',
  styleUrl: './option-picker.scss',
  imports: [MatSelectModule],
})
export class OptionPicker {
  protected readonly i18n = inject(I18nService);

  readonly options = input.required<readonly ChoiceOption[]>();
  /** Selected option id(s); non-string entries are ignored. */
  readonly value = input<unknown>(null);
  readonly multiple = input(false, { transform: booleanAttribute });
  readonly label = input<string>();
  /** Accessible name when there is no visible `label`. */
  readonly ariaLabel = input<string>();

  /** A single id (or null) when `multiple` is false, otherwise a list of ids. */
  readonly valueChange = output<string | string[] | null>();

  protected readonly selectedIds = computed(() => {
    const value = this.value();
    const list = Array.isArray(value) ? value : [value];
    return list.filter((v): v is string => typeof v === 'string' && v !== '');
  });

  protected readonly single = computed(() => this.selectedIds()[0] ?? null);

  protected readonly removedIds = computed(() => {
    const known = new Set(this.options().map((o) => o.id));
    return this.selectedIds().filter((id) => !known.has(id));
  });

  protected emitSingle(id: unknown): void {
    this.valueChange.emit(typeof id === 'string' && id !== '' ? id : null);
  }

  protected emitMultiple(ids: unknown): void {
    const list = Array.isArray(ids) ? ids : [];
    this.valueChange.emit(list.filter((v): v is string => typeof v === 'string'));
  }
}
