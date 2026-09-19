import { Component, effect, ElementRef, inject, output, viewChild } from '@angular/core';
import {
  AbstractControl,
  AsyncValidatorFn,
  FormControl,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { catchFn } from '@shared/helper';
import { formDefinitionSchema } from '@shared/model/model-validator';
import { I18nService } from '../../i18n';

@Component({
  selector: 'fm-form-import-modal',
  templateUrl: './form-import-modal.html',
  styleUrl: './form-import-modal.scss',
  imports: [MatIcon, ReactiveFormsModule, MatButton, MatIconButton],
})
export class FormImportModal {
  protected readonly i18n = inject(I18nService);

  protected readonly formSubmit = output<string | null>();

  protected readonly jsonControl = new FormControl('', {
    asyncValidators: jsonValidatorAsync(),
  });

  private readonly importDialog = viewChild<ElementRef<HTMLDialogElement>>('importDialog');

  constructor() {
    effect(() => {
      const dialog = this.importDialog();
      if (!dialog) return;
      const el = dialog.nativeElement;
      if (!el.open && typeof el.showModal === 'function') el.showModal();
    });
  }

  /** Close when the click lands on the backdrop, not inside the dialog. */
  onDialogClick(event: MouseEvent): void {
    const dialog = this.importDialog();
    if (dialog && event.target === dialog.nativeElement) this.formSubmit.emit(null);
  }

  importText() {
    const raw = (this.jsonControl.value ?? '').trim();
    if (this.jsonControl.invalid || raw === '') return;
    this.formSubmit.emit(raw);
    this.jsonControl.reset('');
  }

  showError() {
    const error = this.jsonControl.errors?.['invalidJson'];
    let msg = error.message ? this.i18n.t(error.message) : undefined;

    if (msg && error.error?.issues) {
      const issue = error.error.issues[0];
      if (!Array.isArray(issue.path)) return;
      const path = issue.path as (string | number)[];

      msg +=
        '\n' +
        path.reduce((prev, curr) => prev + (typeof curr === 'number' ? `[${curr}]` : curr), '') +
        ': ' +
        issue.message;
    }

    return msg ?? '';
  }
}

function jsonValidatorAsync(): AsyncValidatorFn {
  let timeout: number;
  return (control: AbstractControl) => {
    clearTimeout(timeout);
    const value = control.value;

    return new Promise((resolve) => {
      timeout = setTimeout(() => {
        if (!value) {
          return resolve(null);
        }

        const { data, error } = catchFn(() => JSON.parse(value));
        if (error) {
          return resolve({ invalidJson: { message: 'errors.invalidJson' } });
        }

        const { error: parseError } = catchFn(() => formDefinitionSchema.parse(data));
        console.log(parseError);
        if (parseError) {
          return resolve({
            invalidJson: { message: 'errors.invalidDefinition', error: parseError },
          });
        }
        return resolve(null);
      }, 700);
    });
  };
}
