import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  viewChildren,
} from '@angular/core';
import { MatDivider } from '@angular/material/divider';
import {
  MatAccordion,
  MatExpansionPanel,
  MatExpansionPanelHeader,
} from '@angular/material/expansion';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { has } from '@shared/helper';
import { encryptedElementIds } from '@shared/model/encryption.model';
import { QuestionInput } from '../../builder/question-input';
import { type RunnerStore } from '../../core';
import { I18nService } from '../../core/i18n';
import type { ElementViewRef } from '../../core/state/runner.model';
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
    MatIcon,
    MatTooltip,
  ],
  selector: 'fm-question-list',
  templateUrl: './question-list.html',
  styleUrl: './question-list.scss',
})
export class QuestionList {
  private readonly inputs = viewChildren(QuestionInput);
  private readonly injector = inject(Injector);
  readonly store = input.required<RunnerStore>();
  readonly elements = input.required<ElementViewRef[]>();
  readonly group = input<'true' | true>();
  /** Heading level for sections and for questions that no section precedes. */
  readonly level = input(2);
  readonly has = has;
  protected readonly i18n = inject(I18nService);

  /** Questions marked with a lock: only needed when not every answer is encrypted. */
  protected readonly lockedIds = computed(() => {
    const form = this.store().form();
    return form?.settings.encryption?.mode === 'fields'
      ? encryptedElementIds(form)
      : new Set<string>();
  });

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

  constructor() {
    effect(() => {
      const store = this.store();
      const id = store.focusedQuestion();
      // Each nested list checks its own inputs; only the one that owns the question clears it.
      const target = this.inputs().find((i) => i.vr()?.id === id);
      if (!target) return;
      afterNextRender(
        () => {
          target.focus();
          store.focusedQuestion.set(undefined);
        },
        { injector: this.injector },
      );
    });
  }
}
