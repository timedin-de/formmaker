import { CdkDrag, type CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { has } from '@shared/helper';
import type { ElementDefinition, Elements, ElementType } from '@shared/model/form.model';
import { I18nService } from '../core/i18n';
import { fieldMeta } from '../core/model/field-registry';
import { type DesignerStore } from '../core/state/designer.store';
import { canSortAt, DropDragState } from './drop-sort';
import { PropertiesModal } from './properties-modal';

@Component({
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, CdkDrag, CdkDragHandle, CdkDropList],
  selector: 'fm-element-row',
  templateUrl: './element-row.html',
  styleUrl: './element-row.scss',
})
export class ElementRow {
  readonly el = input.required<ElementDefinition>();
  readonly store = input.required<DesignerStore>();
  protected readonly i18n = inject(I18nService);
  protected readonly modal = inject(PropertiesModal);

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
    this.modal.show();
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

  async addChild(type: ElementType = 'text'): Promise<void> {
    this.paletteTarget.emit(false);
    const group = this.el();
    if (group.type !== 'group') return;
    await this.store().addElement(group.id, type, this.i18n.t('row.childQuestion'));
  }
}
