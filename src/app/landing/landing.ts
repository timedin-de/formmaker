import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsRepository } from '../core/state/forms.repository';
import type { FormDefinition } from '../core/model/form.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { downloadJSON, parseJsonFile } from '../core/export/file';
import { validateFormDefinition } from '../core/export/form-schema';

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
  ],
  selector: 'fm-landing',
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class LandingComponent {
  private readonly repo = inject(FormsRepository);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  readonly forms = signal<FormDefinition[]>([]);

  constructor() {
    this.repo.seedDemo();
    this.refresh();
  }

  refresh(): void {
    this.forms.set(this.repo.listForms());
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
    if (!form.updatedAt) return 'n/a';
    return new Date(form.updatedAt).toLocaleDateString();
  }

  exportJson(form: FormDefinition): void {
    downloadJSON(form, toSlug(form.name) + '.json');
  }

  remove(form: FormDefinition): void {
    this.repo.deleteForm(form.id);
    this.refresh();
  }

  async onImport(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const { data } = await parseJsonFile<FormDefinition>(file);
    if (!data) {
      this.snack.open('Could not parse the file. Is it valid JSON?', 'OK', { duration: 4000 });
      return;
    }
    const issues = validateFormDefinition(data);
    if (issues.length > 0) {
      this.snack.open(`Invalid form definition: ${issues[0].message}`, 'OK', { duration: 6000 });
      return;
    }
    this.repo.saveForm(data);
    this.refresh();
    this.snack.open(`Imported "${data.name}"`, 'OK', { duration: 3000 });
  }
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
