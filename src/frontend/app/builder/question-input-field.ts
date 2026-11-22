import { TextFieldModule } from '@angular/cdk/text-field';
import { Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { isChoice } from '@shared/helper';
import { type ElementDefinition } from '@shared/model/form.model';
import type { FieldValue } from '@shared/model/values.model';
import { I18nService } from '../core/i18n';
import type { ElementViewRef } from '../core/state/runner.model';
import { OptionPicker } from './option-picker';
import { QuestionInput } from './question-input';
import { fitsKind, parseRaw, rawText, type ValueKind, valueKindOf } from './value-kind';

let nextId = 0;

/**
 * Enters a fixed value of a question in the builder (static default, validation bound, condition
 * literal) with the runner's own input for its type. Choice questions use a dropdown instead
 * (several options for multi-choice), and yes/no a select with "none", so "no value" stays
 * distinct from "no". A stored value the control cannot show stays visible as raw text with a
 * hint, and is only changed when the author edits it.
 */
@Component({
  templateUrl: './question-input-field.html',
  styleUrl: './question-input-field.scss',
  selector: 'fm-question-input-field',
  host: { '(change)': 'commit()' },
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    OptionPicker,
    QuestionInput,
    TextFieldModule,
  ],
})
export class QuestionInputField {
  protected readonly i18n = inject(I18nService);

  /** The question whose value is entered; its type picks the control. */
  readonly element = input<ElementDefinition | null>(null);
  /** Overrides the control picked from `element`, e.g. `number` for numeric rule bounds. */
  readonly kind = input<ValueKind>();
  readonly value = input<unknown>(null);
  readonly label = input<string>();
  /** Accessible name when there is no visible `label`. */
  readonly ariaLabel = input<string>();
  readonly valueChange = output<FieldValue>();

  protected readonly id = `fm-value-${++nextId}`;
  /** Control of the runner input; mirrors `value` and reports the author's edits. */
  private readonly control = new FormControl<unknown>(null);
  /** A typed value its input has not committed yet (see `commit`). */
  private pending: { value: FieldValue } | null = null;

  protected readonly resolvedKind = computed(() => this.kind() ?? valueKindOf(this.element()));
  protected readonly multiple = computed(() => this.element()?.type === 'multiChoice');
  protected readonly fits = computed(() =>
    fitsKind(this.resolvedKind(), this.value(), this.element(), this.multiple()),
  );
  /** `aria-label` for controls without a visible label. */
  protected readonly aria = computed(() => (this.label() ? undefined : this.ariaLabel()));

  protected readonly options = computed(() => {
    const el = this.element();
    return el && isChoice(el) ? el.options : [];
  });

  /** The runner view of the value, for kinds the runner input shows. */
  protected readonly view = computed<ElementViewRef>(() => ({
    id: this.id,
    el: valueElement(this.resolvedKind(), this.element(), this.id),
    label: '',
    description: '',
    visible: true,
    control: this.control,
    children: [],
  }));

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

  constructor() {
    effect(() => {
      // The shown value now comes from the store, so an uncommitted typed edit (possibly of
      // another question, after the selection moved) must not be committed later. Tracking the
      // element also covers a move to a question whose shown value happens to be equal.
      this.element();
      this.pending = null;
      if (!this.fits()) return;
      const kind = this.resolvedKind();
      const shown = kind === 'number' || kind === 'scale' ? this.numberValue() : this.text();
      untracked(() => {
        if (this.control.value !== shown) this.control.setValue(shown, { emitEvent: false });
      });
    });
    this.control.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      // Each emitted value may be saved at once (rule bounds), so typed inputs wait for their
      // `change` (blur, Enter, a picked date); radios commit when picked or cleared.
      if (this.resolvedKind() === 'scale') this.valueChange.emit(toFieldValue(value));
      else this.pending = { value: toFieldValue(value) };
    });
  }

  /** Emits the typed value once its input commits it (a native `change`). */
  protected commit(): void {
    if (!this.pending) return;
    const { value } = this.pending;
    this.pending = null;
    this.valueChange.emit(value);
  }

  protected emitPicked(value: unknown): void {
    this.valueChange.emit(typeof value === 'boolean' ? value : null);
  }

  protected emitOption(value: string | string[] | null): void {
    this.valueChange.emit(value);
  }

  protected emitRaw(raw: string): void {
    this.valueChange.emit(parseRaw(this.resolvedKind(), raw));
  }
}

/** What the runner input reports, as a stored value: empty text and non-finite numbers are none. */
function toFieldValue(value: unknown): FieldValue {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value === '' ? null : value;
  return null;
}

/**
 * The question the runner input renders for `kind`: the question itself when it holds that kind
 * (keeping unit, input type, time interval, scale steps), else a bare one of that type. Its rules
 * are left out, so they never limit the value being entered (e.g. a rule's own bound).
 */
function valueElement(
  kind: ValueKind,
  el: ElementDefinition | null,
  id: string,
): ElementDefinition {
  const own = el && (el.type === kind || (kind === 'text' && el.type === 'longText'));
  const base = own ? el : { id, type: kind, label: '' };
  return { ...base, validations: [] } as unknown as ElementDefinition;
}
