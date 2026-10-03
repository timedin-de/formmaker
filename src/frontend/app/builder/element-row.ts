import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { has } from '@shared/helper';
import type { ElementDefinition, Elements, ElementType } from '@shared/model/form.model';
import { createElement } from '../core';
import { I18nService } from '../core/i18n';
import { fieldMeta } from '../core/model/field-registry';
import { DesignerStore } from '../core/state/designer.store';
import { canSortAt, DropDragState } from './drop-sort';

@Component({
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, CdkDrag, CdkDropList],
  selector: 'fm-element-row',
  templateUrl: './element-row.html',
  styleUrl: './element-row.scss',
})
export class ElementRow {
  readonly el = input.required<ElementDefinition>();
  readonly store = input.required<DesignerStore>();
  protected readonly i18n = inject(I18nService);

  readonly dropLists = input<string[]>([]);
  readonly dropElement = output<CdkDragDrop<Elements, Elements, string>>();

  protected readonly has = has;
  protected readonly canSortAt = canSortAt;
  protected readonly canEnter = inject(DropDragState).canEnter;

  readonly neighbours = input<{
    before?: ElementDefinition;
    after?: ElementDefinition;
  }>();
  readonly paletteTarget = output<false | ((type: ElementType) => void)>();

  protected meta = computed(() => fieldMeta(this.el().type));
  protected selected = computed(() => this.store().selectedId() === this.el().id);
  protected elEnabledWhen = computed(
    () => !!this.el().enabledWhen?.conditions?.length || !!this.el().enabledWhen?.groups?.length,
  );

  select(): void {
    this.store().select(this.el().id);
  }

  move(dir: -1 | 1, event?: Event): void {
    event?.stopImmediatePropagation();
    this.store().moveElement(this.el().id, dir);
  }

  duplicate(): void {
    this.store().duplicateElement(this.el().id);
  }

  remove(): void {
    this.store().removeElement(this.el().id);
  }

  addChild(type: ElementType = 'text'): void {
    this.paletteTarget.emit(false);
    const group = this.el();
    if (group.type !== 'group') return;
    const child = createElement(type, this.i18n.t('row.childQuestion'));
    this.store().updateElement(group.id, { elements: [...group.elements, child] });
  }
}
