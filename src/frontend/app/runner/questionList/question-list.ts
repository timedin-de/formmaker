import { Component, input } from '@angular/core';
import { MatDivider } from '@angular/material/divider';
import { QuestionInput } from '../../builder/question-input';
import { MarkdownPipe } from '../../core/markdown';
import { has } from '@shared/helper';
import { ElementViewRef } from '@shared/model';

@Component({
  imports: [QuestionInput, MatDivider, MarkdownPipe],
  selector: 'fm-question-list',
  templateUrl: './question-list.html',
  styleUrl: './question-list.scss',
})
export class QuestionList {
  readonly elements = input.required<ElementViewRef[]>();
  readonly group = input<'true' | true>();
  readonly has = has;
}
