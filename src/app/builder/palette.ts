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
  template: `
    <mat-toolbar class="block-title">
      <span>Field palette</span>
    </mat-toolbar>
    <mat-tab-group>
      @for (cat of categories; track cat.key) {
        <mat-tab [label]="cat.label">
          <div class="palette-items">
            @for (meta of fieldsFor(cat.key); track meta.type) {
              <button class="field-btn" (click)="add(meta.type)">
                <mat-icon fontSet="material-icons-outlined">{{ meta.icon }}</mat-icon>
                <span class="field-label">
                  <b>{{ meta.label }}</b>
                  <small>{{ meta.description }}</small>
                </span>
                <mat-icon class="add">add</mat-icon>
              </button>
            }
          </div>
        </mat-tab>
      }
    </mat-tab-group>
  `,
  styles: [
    `
      :host {
        display: block;
        background: var(--mat-sys-surface-container-low);
        border-radius: 12px;
        overflow: hidden;
      }
      .block-title {
        background: transparent;
        font-size: 15px;
        height: 52px;
      }
      :host ::ng-deep .mat-mdc-tab-header {
        --mat-tab-header-active-label-text-color: var(--mat-sys-primary);
        --mat-tab-header-label-text-color: var(--mat-sys-on-surface-variant);
      }
      .palette-items {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .field-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        border: 0;
        background: var(--mat-sys-surface);
        border-radius: 10px;
        padding: 10px 12px;
        cursor: pointer;
        text-align: left;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
        transition:
          transform 0.08s ease,
          box-shadow 0.08s ease;
      }
      .field-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
      }
      .field-btn .add {
        margin-left: auto;
        opacity: 0;
        transition: opacity 0.12s ease;
      }
      .field-btn:hover .add {
        opacity: 0.7;
      }
      .field-label {
        display: flex;
        flex-direction: column;
      }
      .field-label small {
        color: var(--mat-sys-on-surface-variant);
        font-size: 11px;
      }
    `,
  ],
})
export class BuilderPalette {
  readonly store = input.required<DesignerStore>();
  protected readonly categories = CATEGORIES;

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
