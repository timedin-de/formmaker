import { NgTemplateOutlet } from '@angular/common';
import { Component, input } from '@angular/core';
import { MatDivider } from '@angular/material/divider';
import {
  MatAccordion,
  MatExpansionPanel,
  MatExpansionPanelHeader,
} from '@angular/material/expansion';
import { has } from '@shared/helper';
import { ElementViewRef } from '@shared/model';
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
  readonly has = has;
}
