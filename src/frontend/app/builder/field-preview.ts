import { Component, inject, input } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { has } from '@shared/helper';
import type { ChoiceElement, ElementDefinition, ScaleElement } from '@shared/model/form.model';
import { I18nService } from '../core/i18n';
import { MarkdownPipe } from '../core/markdown';

@Component({
  selector: 'fm-field-preview',
  imports: [
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    MarkdownPipe,
  ],
  templateUrl: './field-preview.html',
  styleUrl: './field-preview.scss',
})
export class FieldPreview {
  readonly el = input.required<ElementDefinition>();
  protected readonly i18n = inject(I18nService);

  protected readonly has = has;

  protected headingText(): string {
    const e = this.el() as ElementDefinition & { heading?: string };
    return e.heading || this.el().label;
  }

  protected options(): ChoiceElement['options'] {
    return (this.el() as ChoiceElement).options ?? [];
  }

  protected scaleEl(): ScaleElement {
    return this.el() as ScaleElement;
  }

  protected scaleValues(): number[] {
    const s = this.scaleEl();
    const step = s.step && s.step > 0 ? s.step : 1;
    const out: number[] = [];
    for (let v = s.min; v <= s.max; v += step) out.push(Math.round(v * 100) / 100);
    return out;
  }

  protected groupCount(): number {
    return (this.el() as { elements?: unknown[] }).elements?.length ?? 0;
  }
}
