import { Component, input } from '@angular/core';
import type { ChoiceElement, ElementDefinition, ScaleElement } from '../shared/model/form.model';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';

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
  ],
  templateUrl: './field-preview.html',
  styleUrl: './field-preview.scss',
})
export class FieldPreview {
  readonly el = input.required<ElementDefinition>();

  protected headingText(): string {
    const e = this.el() as ElementDefinition & { heading?: string };
    return e.heading || this.el().label;
  }

  protected legendText(): string {
    const e = this.el() as ElementDefinition & { legend?: string };
    return e.legend || this.el().label;
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
