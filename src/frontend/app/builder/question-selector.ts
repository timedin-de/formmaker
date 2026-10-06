import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSelectModule } from '@angular/material/select';
import { isQuestionOrGroup } from '@shared/helper';
import {
  type ElementDefinition,
  type GroupElement,
  type PageDefinition,
  type QuestionDefinition,
  type QuestionType,
} from '@shared/model';

interface OptionRow {
  el: QuestionDefinition | GroupElement;
  depth: number;
  // false = heading only (a group in question mode, or a group failing the filter)
  selectable: boolean;
}

@Component({
  selector: 'fm-question-selector',
  templateUrl: './question-selector.html',
  imports: [FormsModule, MatSelectModule, MatExpansionModule],
})
export class QuestionSelector {
  readonly pages = input.required<PageDefinition[]>();
  readonly model = input.required<string>();
  readonly selfId = input<string>();
  readonly questionType = input<QuestionType | 'group'>();
  readonly filterFn = input<(e: ElementDefinition) => boolean>();

  readonly selectChange = output<ElementDefinition>();

  selected(selected: boolean, option: ElementDefinition) {
    if (selected) {
      this.selectChange.emit(option);
    }
  }

  // Options are a flat, depth-indented list per page: mat-select only registers mat-options
  // declared directly in its content, so nested groups can't be rendered via a recursive template.
  // Self and its subtree are skipped; subtrees without anything selectable are dropped. Rows keep
  // the original elements (a picked group's full `elements` is needed by callers).
  readonly _pages = computed(() => {
    const self = this.selfId();
    const questionType = this.questionType();
    const groupMode = questionType === 'group';
    const filterFn =
      this.filterFn() ?? ((e: ElementDefinition) => !questionType || questionType === e.type);

    const walk = (elements: ElementDefinition[], depth: number): OptionRow[] =>
      elements.flatMap((e) => {
        if (!isQuestionOrGroup(e) || e.id === self) return [];
        const children = e.type === 'group' ? walk(e.elements, depth + 1) : [];
        const selectable = groupMode === (e.type === 'group') && filterFn(e);
        return selectable || children.length ? [{ el: e, depth, selectable }, ...children] : [];
      });

    return this.pages()
      .map((page) => ({ page, rows: walk(page.elements, 0) }))
      .filter((p) => !!p.rows.length);
  });
}
