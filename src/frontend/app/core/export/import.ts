import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { FormDefinition } from '@shared/model/form.model';
import { parseFormData } from '@shared/model/model-validator';
import { catchFnAsync } from '@shared/helper';
import { I18nService } from '../i18n';
import { validateFormDefinition } from './form-schema';
import { readFileAsText } from './file';
import { FormsRepository } from '../state/forms.repository';

@Injectable({ providedIn: 'root' })
export class FormImportService {
  private readonly snack = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);
  private readonly repo = inject(FormsRepository);
  /** Read, parse and validate an uploaded form file. Returns the definition or null. */
  async onImport(event: Event): Promise<FormDefinition | undefined> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const { data: text } = await catchFnAsync(() => readFileAsText(file));
    if (!text) {
      this.report(this.i18n.t('import.failed', { message: this.i18n.t('import.badFile') }));
      return;
    }
    const form = await this.importJson(text);
    if (!form) return;

    this.snack.open(this.i18n.t('import.success'), 'OK', { duration: 2500 });

    return form;
  }

  /** Parse, validate and persist a raw JSON string. Reports failures, returns undefined. */
  async importJson(raw: string): Promise<FormDefinition | undefined> {
    const { data: form } = parseFormData(raw);
    if (!form) {
      this.report(this.i18n.t('import.failed', { message: this.i18n.t('import.badJson') }));
      return;
    }

    const issues = validateFormDefinition(form);
    if (issues.length > 0) {
      this.report(this.i18n.t('import.failed', { message: issues[0].message }));
      return;
    }
    const saved = await this.repo.newForm(form);

    return saved;
  }

  private report(message: string): void {
    this.snack.open(message, 'OK', { duration: 6000 });
  }
}
