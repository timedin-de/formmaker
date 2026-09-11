import { Component, computed, input } from '@angular/core';
import { DesignerStore } from '../core/state/designer.store';
import { fieldMeta } from '../core/model/field-registry';
import type { ElementDefinition, GroupElement } from '../core/model/form.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  imports: [
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatToolbarModule,
    FormsModule,
    MatTooltipModule,
  ],
  selector: 'fm-element-row',
  template: `
    @if (el().type === 'group') {
      <div class="group-box" [class.selected]="selected()" (click)="select()">
        <div class="row-head">
          <mat-icon class="icon">{{ meta().icon }}</mat-icon>
          <span class="name">{{ el().label }}</span>
          <span class="type-badge">GROUP</span>
          <span class="spacer"></span>
          <button mat-icon-button (click)="move(-1)" matTooltip="Move up">
            <mat-icon>arrow_upward</mat-icon>
          </button>
          <button mat-icon-button (click)="move(1)" matTooltip="Move down">
            <mat-icon>arrow_downward</mat-icon>
          </button>
          <button mat-icon-button (click)="duplicate()" matTooltip="Duplicate">
            <mat-icon>content_copy</mat-icon>
          </button>
          <button mat-icon-button (click)="remove()" matTooltip="Delete">
            <mat-icon>delete_outline</mat-icon>
          </button>
        </div>
        <div class="group-children" (click)="$event.stopPropagation()">
          @for (child of group().elements; track child.id) {
            <fm-element-row [el]="child" [store]="store()" />
          }
          <button class="add-child" (click)="addChild()"><mat-icon>add</mat-icon> Add child</button>
        </div>
      </div>
    } @else {
      <div
        class="row"
        [class.selected]="selected()"
        [class.muted]="el().type === 'section'"
        (click)="select()"
      >
        <mat-icon class="icon">{{ meta().icon }}</mat-icon>
        <div class="body">
          <div class="name">{{ el().label }}</div>
          <div class="sub">
            <span class="type-badge">{{ meta().label }}</span>
            @if (el().required) {
              <span class="required-badge">required</span>
            }
            @if (elEnabledWhen()) {
              <span class="logic-badge">conditional</span>
            }
            @if (elCalculation()) {
              <span class="logic-badge">calculated</span>
            }
            @if (elDefault()) {
              <span class="logic-badge">default</span>
            }
          </div>
        </div>
        <span class="spacer"></span>
        <div class="ops">
          <button mat-icon-button (click)="move(-1)" matTooltip="Move up">
            <mat-icon>arrow_upward</mat-icon>
          </button>
          <button mat-icon-button (click)="move(1)" matTooltip="Move down">
            <mat-icon>arrow_downward</mat-icon>
          </button>
          <button mat-icon-button (click)="duplicate()" matTooltip="Duplicate">
            <mat-icon>content_copy</mat-icon>
          </button>
          <button mat-icon-button (click)="remove()" matTooltip="Delete">
            <mat-icon>delete_outline</mat-icon>
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .row,
      .group-box {
        display: flex;
        align-items: center;
        gap: 12px;
        background: var(--mat-sys-surface);
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 12px;
        padding: 12px 14px;
        cursor: pointer;
        transition:
          border-color 0.12s ease,
          box-shadow 0.12s ease;
        margin-bottom: 8px;
      }
      .row:hover {
        border-color: var(--mat-sys-outline);
      }
      .row.selected,
      .group-box.selected {
        border-color: var(--mat-sys-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--mat-sys-primary) 25%, transparent);
      }
      .row.muted {
        background: color-mix(in srgb, var(--mat-sys-primary) 6%, var(--mat-sys-surface));
      }
      .icon {
        color: var(--mat-sys-primary);
        flex-shrink: 0;
      }
      .body {
        min-width: 0;
        flex: 1;
      }
      .name {
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sub {
        display: flex;
        gap: 6px;
        margin-top: 4px;
      }
      .type-badge,
      .required-badge,
      .logic-badge {
        font-size: 11px;
        padding: 1px 8px;
        border-radius: 999px;
        background: var(--mat-sys-surface-container-high);
        color: var(--mat-sys-on-surface-variant);
      }
      .required-badge {
        background: color-mix(in srgb, var(--mat-sys-error) 12%, transparent);
        color: var(--mat-sys-error);
      }
      .logic-badge {
        background: color-mix(in srgb, var(--mat-sys-tertiary) 14%, transparent);
        color: var(--mat-sys-tertiary);
      }
      .spacer {
        flex: 1;
      }
      .ops {
        display: flex;
        opacity: 0;
        transition: opacity 0.12s ease;
      }
      .row:hover .ops,
      .group-box:hover .ops {
        opacity: 1;
      }
      .group-box {
        flex-direction: column;
        align-items: stretch;
        gap: 0;
        margin-bottom: 10px;
      }
      .row-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 0;
      }
      .group-children {
        margin: 8px 0 4px 18px;
        border-left: 2px dashed var(--mat-sys-outline-variant);
        padding-left: 14px;
      }
      .add-child {
        display: flex;
        align-items: center;
        gap: 6px;
        border: 0;
        background: transparent;
        color: var(--mat-sys-primary);
        cursor: pointer;
        font-weight: 500;
        padding: 6px 4px;
      }
    `,
  ],
})
export class ElementRow {
  readonly el = input.required<ElementDefinition>();
  readonly store = input.required<DesignerStore>();

  protected meta = computed(() => fieldMeta(this.el().type));
  protected selected = computed(() => this.store().selectedId() === this.el().id);
  protected group = computed(() => this.el() as unknown as GroupElement);
  protected elEnabledWhen = computed(
    () => !!this.el().enabledWhen?.conditions?.length || !!this.el().enabledWhen?.groups?.length,
  );
  protected elCalculation = computed(() => {
    const el = this.el();
    return el.type === 'number' && !!el.calculation?.formula;
  });
  protected elDefault = computed(() => !!this.el().defaultValue);

  select(): void {
    this.store().select(this.el().id);
  }

  move(dir: -1 | 1): void {
    this.store().moveElement(this.el().id, dir);
  }

  duplicate(): void {
    this.store().duplicateElement(this.el().id);
  }

  remove(): void {
    this.store().removeElement(this.el().id);
  }

  addChild(): void {
    const group = this.group();
    const child = {
      ...(this.el().type === 'group' ? {} : {}),
      id: `q_${Math.random().toString(36).slice(2, 10)}`,
      type: 'text' as const,
      label: 'Child question',
      enabledWhen: undefined,
      validations: [],
    };
    group.elements = [...group.elements, child as ElementDefinition];
    this.store().updateElement(this.el().id, { elements: group.elements } as never);
  }
}
