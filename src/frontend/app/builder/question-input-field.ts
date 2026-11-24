import { Component, computed, effect, input, output } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { type FileValue } from '@shared/model';

@Component({
  templateUrl: './question-input-field.html',
  styleUrl: './question-input-field.scss',
  selector: 'fm-question-input-field',
  imports: [MatInputModule, FormsModule, ReactiveFormsModule, MatIconModule, MatCheckboxModule],
})
export class QuestionInputField {
  readonly config = input<{
    type: 'date';
    min?: Date;
    max?: Date;
    id?: string;
    control?: FormControl;
    value?: string;
  }>();
  readonly control = computed(() => this.config()?.control ?? new FormControl());

  readonly value = output<string>();

  constructor() {
    effect(() => {
      const value = this.config()?.value;
      if (value !== undefined) {
        this.control().setValue(value);
      }
    });
  }

  fileValue(control: FormControl): FileValue[] {
    const v = control.value;
    return Array.isArray(v) ? (v as FileValue[]) : [];
  }
}
