import { Component, computed, input } from '@angular/core';
import { DesignerStore } from '../core/state/designer.store';
import type { PageDefinition } from '../core/model/form.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { ElementRow } from './element-row';
import { ConditionEditor } from './condition-editor';
import type { ElementDefinition } from '../core/model/form.model';

@Component({
  imports: [
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatToolbarModule,
    FormsModule,
    MatTooltipModule,
    ScrollingModule,
    CdkVirtualScrollViewport,
    ElementRow,
    ConditionEditor,
  ],
  selector: 'fm-builder-canvas',
  template: `
    <div class="canvas">
      <mat-toolbar class="block-title">
        <span class="clicks">
          @for (page of store().form().pages; track page.id) {
            <button
              class="page-chip"
              [class.active]="store().activePageId() === page.id"
              (click)="store().selectPage(page.id)"
            >
              {{ page.title ?? 'Page' }}
              <mat-icon class="del" (click)="removePage(page)">close</mat-icon>
            </button>
          }
          <button class="page-add" matTooltip="Add page" (click)="store().addPage()">
            <mat-icon>add</mat-icon>
          </button>
        </span>
      </mat-toolbar>

      @if (page(); as page) {
        <div class="page-head">
          <div class="fields">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Page title</mat-label>
              <input
                matInput
                [ngModel]="page.title"
                (ngModelChange)="store().updatePage(page.id, { title: $event })"
              />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Subtitle</mat-label>
              <input
                matInput
                [ngModel]="page.subtitle"
                (ngModelChange)="store().updatePage(page.id, { subtitle: $event })"
              />
            </mat-form-field>
          </div>
          <fm-condition-editor
            legend="Page logic — show this page only when"
            [group]="page.enabledWhen ?? emptyGroup()"
            [fields]="fieldOptions()"
            (changed)="store().updatePage(page.id, { enabledWhen: $event })"
          />
        </div>

        @if (page.elements.length === 0) {
          <div class="empty-hint">
            <mat-icon>add_circle_outline</mat-icon>
            <p>Add a field from the palette on the left.</p>
          </div>
        } @else {
          <cdk-virtual-scroll-viewport
            itemSize="92"
            class="viewport"
            [minBufferPx]="600"
            [maxBufferPx]="1200"
          >
            <div *cdkVirtualFor="let el of page.elements; trackBy: trackById" class="row-wrap">
              <fm-element-row [el]="el" [store]="store()" />
            </div>
          </cdk-virtual-scroll-viewport>
        }

        <div class="page-actions">
          <button mat-stroked-button (click)="append()">
            <mat-icon>add</mat-icon> Add question
          </button>
        </div>
      } @else {
        <div class="empty-hint">
          <mat-icon>note_add</mat-icon>
          <p>Add a page to get started.</p>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .canvas {
        display: flex;
        flex-direction: column;
        background: var(--mat-sys-surface-container-low);
        border-radius: 12px;
        overflow: hidden;
        min-height: 0;
      }
      .block-title {
        background: transparent;
        font-size: 15px;
        height: 52px;
        gap: 8px;
      }
      .clicks {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow-x: auto;
        max-width: 100%;
      }
      .page-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--mat-sys-outline-variant);
        background: var(--mat-sys-surface);
        border-radius: 999px;
        padding: 6px 12px;
        cursor: pointer;
        font-size: 13px;
        color: var(--mat-sys-on-surface);
        white-space: nowrap;
      }
      .page-chip.active {
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
      }
      .page-chip.active .del {
        color: var(--mat-sys-on-primary);
      }
      .page-chip .del {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
      .page-add {
        display: inline-flex;
        align-items: center;
        border: 1px dashed var(--mat-sys-outline);
        background: transparent;
        border-radius: 999px;
        padding: 4px 12px;
        cursor: pointer;
      }
      .page-head {
        padding: 8px 16px 12px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      .fields {
        display: flex;
        gap: 12px;
        margin-bottom: 8px;
      }
      .fields mat-form-field {
        flex: 1;
      }
      .viewport {
        flex: 1;
        min-height: 0;
        padding: 14px;
        box-sizing: border-box;
      }
      .row-wrap {
        padding-bottom: 8px;
      }
      .page-actions {
        padding: 10px 16px;
      }
      .empty-hint {
        text-align: center;
        color: var(--mat-sys-on-surface-variant);
        padding: 48px 16px;
      }
      .empty-hint mat-icon {
        font-size: 40px;
        width: 40px;
        height: 40px;
      }
    `,
  ],
})
export class BuilderCanvas {
  readonly store = input.required<DesignerStore>();
  protected page = computed(() => this.store().activePage());
  protected emptyGroup = computed(() => ({ logic: 'all' as const, conditions: [], groups: [] }));
  protected trackById = (_: number, el: ElementDefinition) => el.id;
  protected fieldOptions = computed(() =>
    this.store()
      .form()
      .pages.flatMap((p) => p.elements)
      .filter((el) => el.type !== 'section' && el.type !== 'group')
      .map((el) => ({ id: el.id, label: el.label })),
  );

  removePage(page: PageDefinition): void {
    this.store().removePage(page.id);
  }

  append(): void {
    const page = this.store().activePage();
    if (!page) this.store().addPage();
    this.store().addElement(this.store().activePage()?.id ?? '', 'text');
  }
}
