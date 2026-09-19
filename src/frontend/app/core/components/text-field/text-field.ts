import { Component, inject, input, model, output, signal } from '@angular/core';
import { ControlValueAccessor, FormControl, NgControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { getErrorKey, I18nService } from '../../i18n';

/** Reusable password input with a show/hide toggle and two-way value binding. */
@Component({
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  selector: 'fm-text',
  styleUrl: './text-field.scss',
  templateUrl: './text-field.html',
})
export class TextField implements ControlValueAccessor {
  protected readonly i18n = inject(I18nService);
  protected readonly ngControl = inject(NgControl, { optional: true, self: true });

  get control(): FormControl {
    return this.ngControl?.control as FormControl;
  }
  readonly value = model('');
  readonly label = input.required<string>();
  readonly placeholder = input<string>('');
  readonly type = input<string>('text');

  readonly required = input<string | boolean>(false);

  readonly autocomplete = input<string>('');
  /** Fired when the user presses Enter inside the input. */
  readonly enter = output<void>();

  readonly disabled = signal(false);
  protected touchedCallback?: () => void;

  protected readonly hidden = signal(true);

  getErrorKey = getErrorKey;

  onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  onEnter(): void {
    this.enter.emit();
  }

  toggle(): void {
    this.hidden.update((value) => !value);
  }
  writeValue(_value: string): void {
    /* empty */
  }
  registerOnChange(_fn: (value: string) => void): void {
    /* empty */
  }
  registerOnTouched(_fn: (() => void) | undefined): void {
    /* empty */
  }
  setDisabledState?(_isDisabled: boolean) {
    /* empty */
  }
}
