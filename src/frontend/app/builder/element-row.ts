import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { has } from '@shared/helper';
import type { ElementDefinition, ElementType } from '@shared/model/form.model';
import { createElement } from '../core';
import { I18nService } from '../core/i18n';
import { fieldMeta } from '../core/model/field-registry';
import { DesignerStore } from '../core/state/designer.store';
import { BuilderPalette } from './palette';

@Component({
  imports: [
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatToolbarModule,
    FormsModule,
    MatTooltipModule,
    BuilderPalette,
  ],
  selector: 'fm-element-row',
  templateUrl: './element-row.html',
  styleUrl: './element-row.scss',
})
export class ElementRow {
  readonly el = input.required<ElementDefinition>();
  readonly store = input.required<DesignerStore>();
  protected readonly i18n = inject(I18nService);

  protected readonly has = has;

  readonly showPalette = signal(false);

  protected meta = computed(() => fieldMeta(this.el().type));
  protected selected = computed(() => this.store().selectedId() === this.el().id);
  protected elEnabledWhen = computed(
    () => !!this.el().enabledWhen?.conditions?.length || !!this.el().enabledWhen?.groups?.length,
  );

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

  addChild(type: ElementType = 'text'): void {
    this.showPalette.set(false);
    const group = this.el();
    if (group.type !== 'group') return;
    const child = createElement(type, this.i18n.t('row.childQuestion'));
    group.elements = [...group.elements, child];
    this.store().updateElement(this.el().id, { elements: group.elements });
  }
}
