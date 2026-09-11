import { Component, computed, inject, input } from '@angular/core';
import { DesignerStore } from '../core/state/designer.store';
import type { PageDefinition } from '../shared/model/form.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ElementRow } from './element-row';
import { ConditionEditor } from './condition-editor';
import { FieldPreview } from './field-preview';
import { PropertyPanel } from './property-panel';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { first } from 'rxjs';

@Component({
  imports: [
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatToolbarModule,
    FormsModule,
    MatTooltipModule,
    ElementRow,
    ConditionEditor,
    FieldPreview,
    PropertyPanel,
    RouterLink,
  ],
  selector: 'fm-builder-canvas',
  templateUrl: './canvas.html',
  styleUrl: './canvas.scss',
})
export class BuilderCanvas {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly store = input.required<DesignerStore>();
  readonly preview = input(false);
  protected page = computed(() => this.store().activePage());
  protected emptyGroup = computed(() => ({ logic: 'all' as const, conditions: [], groups: [] }));
  protected fieldOptions = computed(() =>
    this.store()
      .form()
      .pages.flatMap((p) => p.elements)
      .filter((el) => el.type !== 'section' && el.type !== 'group')
      .map((el) => ({ id: el.id, label: el.label })),
  );

  clonePage(page: PageDefinition) {
    this.store().clonePage(page.id);
  }

  removePage(page: PageDefinition): void {
    this.store().removePage(page.id);
  }

  append(): void {
    const page = this.store().activePage();
    if (!page) this.store().addPage();
    this.store().addElement(this.store().activePage()?.id ?? '', 'text');
  }

  selectPage(pageId: string) {
    this.route.queryParams.pipe(first()).subscribe((params) => {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { ...params, page: pageId },
      });
    });
  }
}
