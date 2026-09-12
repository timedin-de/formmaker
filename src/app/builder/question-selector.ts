import { Component, computed, input, output } from '@angular/core';
import { MatSelectModule } from '@angular/material/select';
import { PageDefinition, ElementDefinition, ElementType } from '../shared/model';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'fm-question-selector',
  templateUrl: './question-selector.html',
  imports: [FormsModule, MatSelectModule],
})
export class QuestionSelector {
  readonly pages = input.required<PageDefinition[]>();
  readonly model = input.required();
  readonly selfId = input.required<string>();

  readonly selectChange = output<{ id: string; type: ElementType }>();

  readonly _pages = computed(() => {
    const self = this.selfId();

    function filterFn<T extends ElementDefinition | PageDefinition>(
      e: T[],
    ): Omit<T, 'SectionElement'>[] {
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
