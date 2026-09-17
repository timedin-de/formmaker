import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsRepository } from '../core/state/forms.repository';
import type { FormDefinition } from '@shared/model/form.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { downloadJSON } from '../core/export/file';
import { I18nService } from '../core/i18n';
import { MarkdownPipe } from '../core/markdown';
import { FormImportService } from '../core/export/import';
import { MatTooltip } from '@angular/material/tooltip';

@Component({
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatDividerModule,
    MatSnackBarModule,
    MarkdownPipe,
    MatTooltip,
  ],
  selector: 'fm-landing',
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class LandingComponent {
  private readonly repo = inject(FormsRepository);
  private readonly snack = inject(MatSnackBar);
  protected readonly i18n = inject(I18nService);
  readonly forms = signal<FormDefinition[]>([]);
  private readonly importService = inject(FormImportService);

  constructor() {
    void this.repo.init().then(() => this.refresh());
  }

  async refresh(): Promise<void> {
    this.forms.set(await this.repo.listForms());
  }

  countQuestions(form: FormDefinition): number {
    let n = 0;
    const walk = (els: FormDefinition['pages'][number]['elements']) => {
      for (const el of els) {
        if ((el.type as string) === 'group') walk((el as { elements: typeof els }).elements);
        else if ((el.type as string) !== 'section') n += 1;
      }
    };
    form.pages.forEach((p) => walk(p.elements));
    return n;
  }

  updated(form: FormDefinition) {
    if (!form.updatedAt)
      return { date: this.i18n.t('landing.updated'), time: this.i18n.t('landing.updated') };
    const date = new Date(form.updatedAt);

    return { date: date.toLocaleDateString(), time: date.toLocaleTimeString() };
  }

  exportJson(form: FormDefinition): void {
    downloadJSON(form, toSlug(form.name) + '.json');
  }

  async copyShareLink(form: FormDefinition): Promise<void> {
    const url = `${location.origin}/runner/${form.id}`;
    try {
      await navigator.clipboard.writeText(url);
      this.snack.open(this.i18n.t('landing.linkCopied'), 'OK', { duration: 2500 });
    } catch {
      this.snack.open(url, 'OK', { duration: 6000 });
    }
  }

  async onImport(event: Event): Promise<void> {
    const form = await this.importService.onImport(event);
    if (!form) return;
    await this.refresh();
    this.snack.open(this.i18n.t('landing.imported', { name: form.name }), 'OK', {
      duration: 3000,
    });
  }

  async remove(form: FormDefinition): Promise<void> {
    await this.repo.deleteForm(form.id);
    await this.refresh();
  }
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
