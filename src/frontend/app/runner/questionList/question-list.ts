import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { MatDivider } from '@angular/material/divider';
import {
  MatAccordion,
  MatExpansionPanel,
  MatExpansionPanelHeader,
} from '@angular/material/expansion';
import { has } from '@shared/helper';
import { type ElementViewRef } from '@shared/model';
import { QuestionInput } from '../../builder/question-input';
import { MarkdownPipe } from '../../core/markdown';

@Component({
  imports: [
    QuestionInput,
    MatDivider,
    MarkdownPipe,
    MatAccordion,
    MatExpansionPanel,
    NgTemplateOutlet,
    MatExpansionPanelHeader,
  ],
  selector: 'fm-question-list',
  templateUrl: './question-list.html',
  styleUrl: './question-list.scss',
})
export class QuestionList {
  readonly elements = input.required<ElementViewRef[]>();
  readonly group = input<'true' | true>();
  /** Heading level for sections and for questions that no section precedes. */
  readonly level = input(2);
  readonly has = has;

  /** Heading level per element id: questions after a visible section nest one level below it. */
  readonly levels = computed(() => {
    const levels = new Map<string, number>();
    let afterSection = false;
    for (const vr of this.elements()) {
      if (!vr.visible) continue;
      if (vr.el?.type === 'section') {
        levels.set(vr.id, this.level());
        afterSection = true;
      } else {
        levels.set(vr.id, this.level() + (afterSection ? 1 : 0));
      }
    }
    return levels;
  });
}
