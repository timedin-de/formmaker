import { Component, input, output } from '@angular/core';
import { DesignerStore } from '../core/state/designer.store';
import { FIELD_TYPES } from '../core/model/field-registry';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import type { ElementType } from '../shared/model/form.model';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';

const CATEGORIES = [
  { key: 'basic', label: 'Basic' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'layout', label: 'Layout' },
] as const;

@Component({
  imports: [MatButtonModule, MatIconModule, MatTabsModule, MatToolbarModule, FormsModule],
  selector: 'fm-builder-palette',
  templateUrl: './palette.html',
  styleUrl: './palette.scss',
})
export class BuilderPalette {
  readonly store = input<DesignerStore>();
  readonly horizontal = input(false);
  public readonly isModal = input(false);
  public readonly addModule = output<ElementType>();
  protected readonly categories = CATEGORIES;
  protected readonly allFields = FIELD_TYPES;

  fieldsFor(key: (typeof CATEGORIES)[number]['key']): typeof FIELD_TYPES {
    return FIELD_TYPES.filter((f) => f.category === key);
  }

  add(type: ElementType): void {
    if (this.isModal()) {
      this.addModule.emit(type);
      return;
    }

    const store = this.store();

    if (store) {
      const page = store.activePage();
      if (!page) {
        store.addPage();
      }
      store.addElement(store.activePage()?.id ?? store.form().pages[0]?.id ?? '', type);
    }
  }
}
