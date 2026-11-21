import { booleanAttribute, Component, computed, inject, input, output } from '@angular/core';
import { type FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { has, isChoice } from '@shared/helper';
import type { ElementDefinition } from '@shared/model/form.model';
import type { FieldValue } from '@shared/model/values.model';
import { I18nService } from '../core/i18n';
import { OptionPicker } from './option-picker';
import { fitsKind, parseRaw, rawText, scaleSteps, type ValueKind, valueKindOf } from './value-kind';

/**
 * Enters a value of a question with the control matching its type.
 *
 * Bound to a `control`, it is the runner's input (used for dates). Bound to `value` /
 * `valueChange`, it enters fixed values in the builder (static default, validation bound,
 * condition literal); there a stored value the control cannot show stays visible as raw text
 * with a hint, and is only changed when the author edits it.
 */
@Component({
  templateUrl: './question-input-field.html',
  styleUrl: './question-input-field.scss',
  selector: 'fm-question-input-field',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    OptionPicker,
  ],
})
export class QuestionInputField {
  protected readonly i18n = inject(I18nService);

  /** The question whose value is entered; its type picks the control. */
  readonly element = input<ElementDefinition | null>(null);
  /** Overrides the control picked from `element`, e.g. `number` for numeric rule bounds. */
  readonly kind = input<ValueKind>();
  /** Runner form control; when set, the input binds to it instead of `value`. */
  readonly control = input<FormControl>();
  readonly value = input<unknown>(null);
  readonly id = input<string>();
  readonly min = input<Date>();
  readonly max = input<Date>();
  readonly label = input<string>();
  /** Accessible name when there is no visible `label`. */
  readonly ariaLabel = input<string>();
  /** Picks a single option even for a multi-choice question (condition literals). */
  readonly single = input(false, { transform: booleanAttribute });
  readonly valueChange = output<FieldValue>();

  protected readonly resolvedKind = computed(() => this.kind() ?? valueKindOf(this.element()));
  protected readonly multiple = computed(
    () => !this.single() && this.element()?.type === 'multiChoice',
  );
  protected readonly fits = computed(
    () =>
      !!this.control() ||
      fitsKind(this.resolvedKind(), this.value(), this.element(), this.multiple()),
  );
  /** `aria-label` for controls without a visible label. */
  protected readonly aria = computed(() => (this.label() ? null : (this.ariaLabel() ?? null)));

  protected readonly options = computed(() => {
    const el = this.element();
    return el && isChoice(el) ? el.options : [];
  });
  protected readonly scaleValues = computed(() => {
    const el = this.element();
    return el?.type === 'scale' ? scaleSteps(el) : [];
  });
  protected readonly unit = computed(() => {
    const el = this.element();
    return el?.type === 'number' ? (el.unit ?? '') : '';
  });
  /** `step` in seconds for time pickers, as in the runner. */
  protected readonly timeStep = computed(() => {
    const el = this.element();
    if (!el || !has(el, 'timeInterval')) return 60;
    const { value, multiplier } = el.timeInterval;
    return Number(multiplier) * Math.floor(value);
  });

  /** The stored value as the typed control shows it; only read while it `fits`. */
  protected readonly text = computed(() => rawText(this.value()));
  protected readonly numberValue = computed(() => {
    const v = this.value();
    return v === null || v === undefined || v === '' ? null : Number(v);
  });
  protected readonly boolValue = computed(() => {
    const v = this.value();
    return v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;
  });

  protected emitText(raw: string): void {
    this.valueChange.emit(raw === '' ? null : raw);
  }

  protected emitNumber(value: unknown): void {
    this.valueChange.emit(typeof value === 'number' && Number.isFinite(value) ? value : null);
  }

  protected emitPicked(value: unknown): void {
    this.valueChange.emit(typeof value === 'number' || typeof value === 'boolean' ? value : null);
  }

  protected emitOption(value: string | string[] | null): void {
    this.valueChange.emit(this.multiple() || !Array.isArray(value) ? value : (value[0] ?? null));
  }

  protected emitRaw(raw: string): void {
    this.valueChange.emit(parseRaw(this.resolvedKind(), raw));
  }
}
