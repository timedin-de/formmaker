import { Component, computed, input, signal } from '@angular/core';
import { DesignerStore } from '../core/state/designer.store';
import { fieldMeta } from '../core/model/field-registry';
import type { ElementDefinition, ElementType, GroupElement } from '../shared/model/form.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
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

  readonly showPalette = signal(false);

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

  addChild(type: ElementType = 'text'): void {
    this.showPalette.set(false);
    const group = this.group();
    const child = {
      ...(this.el().type === 'group' ? {} : {}),
      id: `q_${Math.random().toString(36).slice(2, 10)}`,
      type,
      label: 'Child question',
      enabledWhen: undefined,
      width: 1,
    };
    group.elements = [...group.elements, child as ElementDefinition];
    this.store().updateElement(this.el().id, { elements: group.elements } as never);
  }
}
