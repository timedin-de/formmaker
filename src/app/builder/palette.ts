import { Component, input } from '@angular/core';
import { DesignerStore } from '../core/state/designer.store';
import { FIELD_TYPES } from '../core/model/field-registry';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import type { ElementType } from '../core/model/form.model';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';

const CATEGORIES = [
  { key: 'basic', label: 'Basic' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'special', label: 'Special' },
  { key: 'layout', label: 'Layout' },
] as const;

@Component({
  imports: [MatButtonModule, MatIconModule, MatTabsModule, MatToolbarModule, FormsModule],
  selector: 'fm-builder-palette',
  templateUrl: './palette.html',
  styleUrl: './palette.scss',
})
export class BuilderPalette {
  readonly store = input.required<DesignerStore>();
  readonly horizontal = input(false);
  protected readonly categories = CATEGORIES;
  protected readonly allFields = FIELD_TYPES;

  fieldsFor(key: (typeof CATEGORIES)[number]['key']): typeof FIELD_TYPES {
    return FIELD_TYPES.filter((f) => f.category === key);
  }

  add(type: ElementType): void {
    const page = this.store().activePage();
    if (!page) {
      this.store().addPage();
    }
    this.store().addElement(
      this.store().activePage()?.id ?? this.store().form().pages[0]?.id ?? '',
      type,
    );
  }
}
