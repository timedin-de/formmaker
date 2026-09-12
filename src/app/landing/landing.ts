import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsRepository } from '../core/state/forms.repository';
import type { FormDefinition } from '../shared/model/form.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { downloadJSON, parseJsonFile } from '../core/export/file';
import { validateFormDefinition } from '../core/export/form-schema';
import { I18nService } from '../core/i18n';
import { MarkdownPipe } from '../core/markdown';

@Component({
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatToolbarModule,
    MatDividerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MarkdownPipe,
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

  constructor() {
    void this.repo
      .init()
      .then(() => this.repo.seedDemo())
      .then(() => this.refresh());
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

  updated(form: FormDefinition): string {
    if (!form.updatedAt) return this.i18n.t('landing.updated');
    return new Date(form.updatedAt).toLocaleDateString();
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

  async remove(form: FormDefinition): Promise<void> {
    await this.repo.deleteForm(form.id);
    await this.refresh();
  }

  async onImport(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const { data } = await parseJsonFile<FormDefinition>(file);
    if (!data) {
      this.snack.open(this.i18n.t('landing.invalidJson'), 'OK', { duration: 4000 });
      return;
    }
    const issues = validateFormDefinition(data);
    if (issues.length > 0) {
      this.snack.open(
        this.i18n.t('landing.invalidDefinition', { message: issues[0].message }),
        'OK',
        { duration: 6000 },
      );
      return;
    }
    await this.repo.saveForm(data);
    await this.refresh();
    this.snack.open(this.i18n.t('landing.imported', { name: data.name }), 'OK', { duration: 3000 });
  }
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
