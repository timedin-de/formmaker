import {
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { I18nService } from '../../i18n';

let nextId = 0;

/**
 * Modal that asks before a destructive action. Cancel has the initial focus and Escape
 * cancels. `closed` emits once: `true` to go ahead, `false` otherwise.
 */
@Component({
  selector: 'fm-confirm-dialog',
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
  imports: [MatButton, MatFormFieldModule, MatInputModule],
})
export class ConfirmDialog {
  protected readonly i18n = inject(I18nService);

  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input.required<string>();
  /** When set, confirming stays disabled until this word is typed (case-insensitive). */
  readonly confirmWord = input<string>();

  readonly closed = output<boolean>();

  protected readonly id = `confirm-dialog-${++nextId}`;
  /** What was typed; starts over whenever the dialog asks about something else. */
  protected readonly typed = linkedSignal({
    source: () => [this.message(), this.confirmWord()],
    computation: () => '',
  });
  protected readonly canConfirm = computed(() => {
    const word = this.confirmWord();
    return !word || this.typed().trim().toLocaleLowerCase() === word.toLocaleLowerCase();
  });

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private answered = false;

  constructor() {
    effect(() => {
      const el = this.dialog()?.nativeElement;
      if (el && !el.open && typeof el.showModal === 'function') el.showModal();
    });
  }

  protected answer(ok: boolean): void {
    if (this.answered || (ok && !this.canConfirm())) return;
    this.answered = true;
    // Closing (instead of only removing it) hands the focus back to the button that opened it.
    const el = this.dialog()?.nativeElement;
    if (el?.open && typeof el.close === 'function') el.close();
    this.closed.emit(ok);
  }
}
