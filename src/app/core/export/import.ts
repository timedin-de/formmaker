import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { FormDefinition } from '../../shared/model/form.model';
import { parseFormData } from '../../shared/model/model-validator';
import { catchFnAsync } from '../../shared/helper';
import { I18nService } from '../i18n';
import { validateFormDefinition } from './form-schema';
import { readFileAsText } from './file';

@Injectable({ providedIn: 'root' })
export class FormImportService {
  private readonly snack = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);

  /** Read, parse and validate an uploaded form file. Returns the definition or null. */
  async onImport(event: Event): Promise<FormDefinition | undefined> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const { data: text } = await catchFnAsync(() => readFileAsText(file));
    if (!text) {
      this.report(this.i18n.t('import.failed', { message: this.i18n.t('import.badFile') }));
      return;
    }
    const { data: form } = parseFormData(text);
    if (!form) {
      this.report(this.i18n.t('import.failed', { message: this.i18n.t('import.badJson') }));
      return;
    }

    const issues = validateFormDefinition(form);
    if (issues.length > 0) {
      this.report(this.i18n.t('import.failed', { message: issues[0].message }));
      return;
    }
    this.snack.open(this.i18n.t('import.success'), 'OK', { duration: 2500 });

    return form;
  }

  private report(message: string): void {
    this.snack.open(message, 'OK', { duration: 6000 });
  }
}
