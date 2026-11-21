import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { formName } from '@shared/helper';
import { countQuestions } from '@shared/model/form-tree';
import { toPortableForm, type FormDefinition, type FormWithOwner } from '@shared/model/form.model';
import { ConfirmDialog, FormImportModal } from '../core/components';
import { downloadJSON } from '../core/export/file';
import { FormImportService } from '../core/export/import';
import { I18nService } from '../core/i18n';
import { MarkdownPipe } from '../core/markdown';
import { Notifier } from '../core/notifier';
import { FormsRepository } from '../core/state/forms.repository';

@Component({
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatDividerModule,
    MarkdownPipe,
    MatTooltip,
    FormImportModal,
    ConfirmDialog,
    MatMenuModule,
  ],
  selector: 'fm-landing',
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class LandingComponent {
  private readonly repo = inject(FormsRepository);
  private readonly notifier = inject(Notifier);
  protected readonly i18n = inject(I18nService);
  readonly forms = signal<FormWithOwner[] | undefined>(undefined);
  private readonly importService = inject(FormImportService);

  protected showTextModal = signal(false);
  /** The form whose deletion the confirm dialog asks about. */
  protected readonly pendingDelete = signal<{
    form: FormDefinition;
    message: string;
    word: string | undefined;
  } | null>(null);

  readonly formName = formName;

  constructor() {
    void this.repo.init().then(() => this.refresh());
  }

  async refresh(): Promise<void> {
    this.forms.set(await this.repo.listForms());
  }

  readonly countQuestions = countQuestions;

  updated(form: FormDefinition) {
    if (!form.updatedAt)
      return { date: this.i18n.t('landing.updated'), time: this.i18n.t('landing.updated') };
    const date = new Date(form.updatedAt);

    return { date: date.toLocaleDateString(), time: date.toLocaleTimeString() };
  }

  exportJson(form: FormDefinition): void {
    const name = formName(form, this.i18n);
    downloadJSON(toPortableForm(form), toSlug(name) + '.json');
  }

  ownerLabel(form: FormWithOwner): string {
    return form.owner?.email ?? this.i18n.t('landing.ownerUnknown');
  }

  ownerInitials(form: FormWithOwner): string {
    const localPart = form.owner?.email.split('@')[0]?.trim() ?? '';
    const parts = localPart.split(/[._-]+/).filter(Boolean);
    const initials = parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
    return initials || '?';
  }

  async copyShareLink(form: FormDefinition): Promise<void> {
    const url = `${location.origin}/runner/${form.id}`;
    try {
      await navigator.clipboard.writeText(url);
      this.notifier.ok('landing.linkCopied');
    } catch {
      this.notifier.errorText(url);
    }
  }

  async onImport(event: Event): Promise<void> {
    const form = await this.importService.onImport(event);
    if (!form) return;
    await this.refresh();
  }

  async importText(raw: string | null): Promise<void> {
    if (raw === null) return this.showTextModal.set(false);
    const form = await this.importService.importJson(raw);
    if (!form) return;
    const name = formName(form, this.i18n);
    this.showTextModal.set(false);
    await this.refresh();
    this.notifier.ok('landing.imported', { name });
  }

  /**
   * Asks before deleting `form`, naming how many submissions go with it. Like clearing
   * them, losing submissions needs the confirm word typed, also when they can't be counted.
   */
  async remove(form: FormDefinition): Promise<void> {
    const name = formName(form, this.i18n);
    const word = this.i18n.t('confirm.word');
    try {
      const n = (await this.repo.submissionsFor(form.id)).length;
      const message = this.i18n.t('landing.deleteText', { name, n });
      this.pendingDelete.set({ form, message, word: n > 0 ? word : undefined });
    } catch {
      const message = this.i18n.t('landing.deleteTextUnknown', { name });
      this.pendingDelete.set({ form, message, word });
    }
  }

  async confirmRemove(ok: boolean): Promise<void> {
    const pending = this.pendingDelete();
    this.pendingDelete.set(null);
    if (!ok || !pending) return;
    await this.repo.deleteForm(pending.form.id);
    await this.refresh();
  }
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
