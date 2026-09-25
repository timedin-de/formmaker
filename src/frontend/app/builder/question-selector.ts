import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSelectModule } from '@angular/material/select';
import { ElementDefinition, PageDefinition } from '@shared/model';

@Component({
  selector: 'fm-question-selector',
  templateUrl: './question-selector.html',
  imports: [FormsModule, MatSelectModule, MatExpansionModule],
})
export class QuestionSelector {
  readonly pages = input.required<PageDefinition[]>();
  readonly model = input.required<string>();
  readonly selfId = input.required<string>();

  readonly selectChange = output<ElementDefinition>();

  selected(selected: boolean, option: ElementDefinition) {
    if (selected) {
      this.selectChange.emit(option);
    }
  }

  readonly _pages = computed(() => {
    const self = this.selfId();

    function filterFn<T extends ElementDefinition | PageDefinition>(e: T[]): T[] {
      return e
        .filter((e) => !(e.id === self || ('type' in e && e.type === 'section')))
        .map((e) => {
          if ('elements' in e) {
            return {
              ...e,
              elements: filterFn(e.elements),
            };
          }
          return e;
        })
        .filter((e) => !('elements' in e) || !!e.elements.length);
    }

    return filterFn(this.pages());
  });
}
