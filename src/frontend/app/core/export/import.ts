import { Injectable, inject } from '@angular/core';
import { catchFnAsync } from '@shared/helper';
import { type FormDefinition } from '@shared/model';
import { parseFormData } from '@shared/schemas';
import { Notifier } from '../notifier';
import { I18nService } from '../i18n';
import { FormsRepository } from '../state/forms.repository';
import { readFileAsText } from './file';

@Injectable({ providedIn: 'root' })
export class FormImportService {
  private readonly notifier = inject(Notifier);
  private readonly i18n = inject(I18nService);
  private readonly repo = inject(FormsRepository);
  /** Read, parse and validate an uploaded form file. Returns the definition or null. */
  async onImport(event: Event): Promise<FormDefinition | undefined> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const { data: text } = await catchFnAsync(() => readFileAsText(file));
    if (!text) {
      this.notifier.error('import.failed', { message: this.i18n.t('import.badFile') });
      return;
    }
    return await this.importJson(text);
  }

  /** Parse, validate and persist a raw JSON string. Reports failures, returns undefined. */
  async importJson(raw: string): Promise<FormDefinition | undefined> {
    const { data: form } = parseFormData(raw);
    if (!form) {
      this.notifier.error('import.failed', { message: this.i18n.t('import.badJson') });
      return;
    }
    const saved = await this.repo.importForm(form);

    this.notifier.ok('import.success');

    return saved;
  }
}
