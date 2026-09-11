import { Component, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DesignerStore } from '../core/state/designer.store';
import { fieldMeta } from '../core/model/field-registry';
import type {
  ChoiceElement,
  DefaultValueDef,
  ElementDefinition,
  NumberElement,
} from '../core/model/form.model';
import type { ValidationRule, ValidationRuleType } from '../core/model/validation.model';
import { VALIDATION_RULE_TYPES, validationRule } from '../core/model/validation.model';
import { uuid } from '../core/model/ids';
import { ConditionEditor } from './condition-editor';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';

const WIDTHS = [
  { value: 'full', label: 'Full', factor: 1 },
  { value: 'half', label: 'Half', factor: 0.5 },
  { value: 'third', label: 'Third', factor: 0.33 },
] as const;

const INPUT_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'phone', label: 'Phone' },
  { value: 'number', label: 'Number' },
] as const;

@Component({
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatExpansionModule,
    ConditionEditor,
  ],
  selector: 'fm-property-panel',
  template: `
    <div class="panel">
      @if (el(); as el) {
        <div class="head">
          <mat-icon>{{ meta().icon }}</mat-icon>
          <div class="hdr">
            <div class="title">{{ meta().label }}</div>
            <div class="sub muted ellipsis">{{ el.id }}</div>
          </div>
        </div>

        <div class="scroll">
          <div class="section">
            <div class="sec-title">Basics</div>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Label</mat-label>
              <input matInput [ngModel]="el.label" (ngModelChange)="patch({ label: $event })" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Description</mat-label>
              <input
                matInput
                [ngModel]="el.description"
                (ngModelChange)="patch({ description: $event })"
              />
            </mat-form-field>
            @if (wantsPlaceholder(el)) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Placeholder</mat-label>
                <input
                  matInput
                  [ngModel]="el.placeholder"
                  (ngModelChange)="patch({ placeholder: $event })"
                />
              </mat-form-field>
            }

            @if (el.type === 'text') {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Keyboard type</mat-label>
                <mat-select
                  [ngModel]="el.inputType ?? 'text'"
                  (ngModelChange)="patch({ inputType: $event })"
                >
                  @for (t of INPUT_TYPES; track t.value) {
                    <mat-option [value]="t.value">{{ t.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Max length</mat-label>
                <input
                  matInput
                  type="number"
                  [ngModel]="el.maxLength ?? ''"
                  (ngModelChange)="patch({ maxLength: numOrUndef($event) })"
                />
              </mat-form-field>
            }
            @if (el.type === 'longText') {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Rows</mat-label>
                <input
                  matInput
                  type="number"
                  [ngModel]="el.rows ?? ''"
                  (ngModelChange)="patch({ rows: numOrUndef($event) })"
                />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Max length</mat-label>
                <input
                  matInput
                  type="number"
                  [ngModel]="el.maxLength ?? ''"
                  (ngModelChange)="patch({ maxLength: numOrUndef($event) })"
                />
              </mat-form-field>
            }

            @if (el.type === 'number') {
              <div class="two-col">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Min</mat-label>
                  <input
                    matInput
                    type="number"
                    [ngModel]="el.min ?? ''"
                    (ngModelChange)="patch({ min: numOrUndef($event) })"
                  />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Max</mat-label>
                  <input
                    matInput
                    type="number"
                    [ngModel]="el.max ?? ''"
                    (ngModelChange)="patch({ max: numOrUndef($event) })"
                  />
                </mat-form-field>
                @if (el.type === 'number') {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Step</mat-label>
                    <input
                      matInput
                      type="number"
                      [ngModel]="el.step ?? ''"
                      (ngModelChange)="patch({ step: numOrUndef($event) })"
                    />
                  </mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Unit</mat-label>
                    <input
                      matInput
                      [ngModel]="el.unit ?? ''"
                      (ngModelChange)="patch({ unit: $event })"
                    />
                  </mat-form-field>
                }
              </div>
            }

            @if (el.type === 'scale') {
              <div class="two-col">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Min</mat-label>
                  <input
                    matInput
                    type="number"
                    [ngModel]="el.min"
                    (ngModelChange)="patch({ min: num($event) })"
                  />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Max</mat-label>
                  <input
                    matInput
                    type="number"
                    [ngModel]="el.max"
                    (ngModelChange)="patch({ max: num($event) })"
                  />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Step</mat-label>
                  <input
                    matInput
                    type="number"
                    [ngModel]="el.step"
                    (ngModelChange)="patch({ step: num($event) })"
                  />
                </mat-form-field>
              </div>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Min scale label</mat-label>
                <input
                  matInput
                  [ngModel]="el.minLabel ?? ''"
                  (ngModelChange)="patch({ minLabel: $event })"
                />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Max scale label</mat-label>
                <input
                  matInput
                  [ngModel]="el.maxLabel ?? ''"
                  (ngModelChange)="patch({ maxLabel: $event })"
                />
              </mat-form-field>
            }

            @if (el.type === 'file') {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Accepted file types (ext or MIME, comma-separated)</mat-label>
                <input
                  matInput
                  [ngModel]="el.accept ?? ''"
                  (ngModelChange)="patch({ accept: $event })"
                />
              </mat-form-field>
              <mat-checkbox
                [checked]="el.multiple ?? false"
                (change)="patch({ multiple: $event.checked })"
              >
                Allow multiple files
              </mat-checkbox>
            }

            @if (el.type === 'section') {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Heading</mat-label>
                <input
                  matInput
                  [ngModel]="el.heading"
                  (ngModelChange)="patch({ heading: $event })"
                />
              </mat-form-field>
            }

            @if (el.type === 'group') {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Legend</mat-label>
                <input
                  matInput
                  [ngModel]="el.legend ?? ''"
                  (ngModelChange)="patch({ legend: $event })"
                />
              </mat-form-field>
              <mat-checkbox
                [checked]="el.collapsible ?? false"
                (change)="patch({ collapsible: $event.checked })"
              >
                Collapsible group
              </mat-checkbox>
            }

            <div class="opt-row">
              <mat-checkbox
                [checked]="el.required ?? false"
                (change)="patch({ required: $event.checked })"
              >
                Required
              </mat-checkbox>
              <mat-checkbox
                [checked]="el.readonly ?? false"
                (change)="patch({ readonly: $event.checked })"
              >
                Read only
              </mat-checkbox>
            </div>
            <div class="opt-row label-row">
              <span class="sec-label">Width</span>
              <mat-button-toggle-group
                [value]="widthValue(el.width)"
                (valueChange)="setWidth($event)"
              >
                @for (w of WIDTHS; track w.value) {
                  <mat-button-toggle [value]="w.value">{{ w.label }}</mat-button-toggle>
                }
              </mat-button-toggle-group>
            </div>
          </div>

          @if (isChoice(el)) {
            <div class="section">
              <div class="sec-title">Options</div>
              <div class="opts">
                @for (opt of el.options; track opt.id; let i = $index) {
                  <div class="opt-editor">
                    <span class="opt-idx">{{ i + 1 }}</span>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <input
                        matInput
                        placeholder="Label"
                        [ngModel]="opt.label"
                        (ngModelChange)="patchOption(i, { label: $event })"
                      />
                    </mat-form-field>
                    <mat-form-field
                      appearance="outline"
                      subscriptSizing="dynamic"
                      class="val-field"
                    >
                      <input
                        matInput
                        placeholder="Value"
                        [ngModel]="str(opt.value)"
                        (ngModelChange)="patchOption(i, { value: stringOrNum($event) })"
                      />
                    </mat-form-field>
                    <button mat-icon-button matTooltip="Move up" (click)="moveOption(i, -1)">
                      <mat-icon>arrow_upward</mat-icon>
                    </button>
                    <button mat-icon-button matTooltip="Move down" (click)="moveOption(i, 1)">
                      <mat-icon>arrow_downward</mat-icon>
                    </button>
                    <button mat-icon-button matTooltip="Remove" (click)="removeOption(i)">
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>
                }
              </div>
              <div class="add-row">
                <button mat-stroked-button (click)="addOption()">
                  <mat-icon>add</mat-icon> Add option
                </button>
              </div>
            </div>
          }

          <div class="section">
            <div class="sec-title">Default value</div>
            <mat-button-toggle-group
              [value]="defaultKind(el)"
              (valueChange)="setDefaultKind($event)"
            >
              <mat-button-toggle value="none">None</mat-button-toggle>
              <mat-button-toggle value="static">Static</mat-button-toggle>
              <mat-button-toggle value="expression">Expression</mat-button-toggle>
              <mat-button-toggle value="field">From field</mat-button-toggle>
            </mat-button-toggle-group>

            @switch (defaultKind(el)) {
              @case ('static') {
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Static value</mat-label>
                  <input matInput [ngModel]="staticText(el)" (ngModelChange)="setStatic($event)" />
                </mat-form-field>
              }
              @case ('expression') {
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Expression — e.g. now(), concat('A', 'B')</mat-label>
                  <textarea
                    matInput
                    rows="2"
                    [ngModel]="exprText(el)"
                    (ngModelChange)="setExpr($event)"
                  ></textarea>
                </mat-form-field>
              }
              @case ('fromField') {
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-select [ngModel]="fieldRef(el)" (ngModelChange)="setFromField($event)">
                    @for (opt of fields(); track opt.id) {
                      <mat-option [value]="opt.id">{{ opt.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              }
            }
          </div>

          @if (el.type === 'number') {
            <div class="section">
              <div class="sec-title">Calculation</div>
              <mat-checkbox [checked]="!!el.calculation" (change)="toggleCalc($event.checked)">
                Compute this field
              </mat-checkbox>
              @if (el.calculation) {
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Formula — e.g. (n_a * n_b) / 100</mat-label>
                  <textarea
                    matInput
                    rows="2"
                    [ngModel]="el.calculation.formula"
                    (ngModelChange)="setCalc($event)"
                  ></textarea>
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Decimals</mat-label>
                  <input
                    matInput
                    type="number"
                    [ngModel]="el.calculation.decimals ?? ''"
                    (ngModelChange)="setCalcDecimals($event)"
                  />
                </mat-form-field>
              }
            </div>
          }

          <div class="section">
            <div class="sec-title">Visibility</div>
            <fm-condition-editor
              legend="Show this field when"
              [group]="el.enabledWhen ?? emptyGroup()"
              [fields]="fields()"
              (changed)="patch({ enabledWhen: $event })"
            />
            @if (hasGroup(el)) {
              <button mat-stroked-button (click)="clearGroup()">
                <mat-icon>lock_open</mat-icon> Always visible
              </button>
            }
          </div>

          <div class="section">
            <div class="sec-title">Validation</div>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-select placeholder="Add a rule" (selectionChange)="addRule($event.value)">
                @for (r of VALIDATION_RULE_TYPES; track r.type) {
                  <mat-option [value]="r.type">{{ r.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <div class="rules">
              @for (rule of el.validations ?? []; track rule.id; let i = $index) {
                <div class="rule">
                  <div class="rule-top">
                    <span class="rule-name">{{ ruleLabel(rule.rule) }}</span>
                    <button mat-icon-button matTooltip="Remove" (click)="removeRule(rule.id)">
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Message</mat-label>
                    <input
                      matInput
                      [ngModel]="rule.message ?? defaultRuleMessage(rule.rule)"
                      (ngModelChange)="patchRule(rule.id, { message: $event })"
                    />
                  </mat-form-field>

                  @switch (ruleInputKind(rule.rule)) {
                    @case ('number') {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>Value</mat-label>
                        <input
                          matInput
                          type="number"
                          [ngModel]="str(rule.value)"
                          (ngModelChange)="patchRule(rule.id, { value: stringOrNum($event) })"
                        />
                      </mat-form-field>
                    }
                    @case ('text') {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>Value</mat-label>
                        <input
                          matInput
                          [ngModel]="str(rule.value)"
                          (ngModelChange)="patchRule(rule.id, { value: $event })"
                        />
                      </mat-form-field>
                    }
                    @case ('range') {
                      <div class="two-col">
                        <mat-form-field appearance="outline" subscriptSizing="dynamic">
                          <mat-label>From</mat-label>
                          <input
                            matInput
                            type="number"
                            [ngModel]="str(rule.value)"
                            (ngModelChange)="patchRule(rule.id, { value: stringOrNum($event) })"
                          />
                        </mat-form-field>
                        <mat-form-field appearance="outline" subscriptSizing="dynamic">
                          <mat-label>To</mat-label>
                          <input
                            matInput
                            type="number"
                            [ngModel]="str(rule.valueTo)"
                            (ngModelChange)="patchRule(rule.id, { valueTo: stringOrNum($event) })"
                          />
                        </mat-form-field>
                      </div>
                    }
                    @case ('pattern') {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>Regex (JS)</mat-label>
                        <input
                          matInput
                          [ngModel]="rule.pattern ?? ''"
                          (ngModelChange)="patchRule(rule.id, { pattern: $event })"
                        />
                      </mat-form-field>
                    }
                    @case ('date') {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>Date</mat-label>
                        <input
                          matInput
                          type="date"
                          [ngModel]="str(rule.value)"
                          (ngModelChange)="patchRule(rule.id, { value: $event })"
                        />
                      </mat-form-field>
                    }
                    @case ('accept') {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>Allowed types (.pdf, image/*)</mat-label>
                        <input
                          matInput
                          [ngModel]="rule.accept ?? ''"
                          (ngModelChange)="patchRule(rule.id, { accept: $event })"
                        />
                      </mat-form-field>
                    }
                    @case ('expression') {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>Expression or msg('…')</mat-label>
                        <textarea
                          matInput
                          rows="2"
                          [ngModel]="rule.expression ?? ''"
                          (ngModelChange)="patchRule(rule.id, { expression: $event })"
                        ></textarea>
                      </mat-form-field>
                    }
                  }
                </div>
              }
            </div>
          </div>
        </div>
      } @else {
        <div class="placeholder">
          <mat-icon>inbox</mat-icon>
          <p>Select a field to edit its properties.</p>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .panel {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        background: var(--mat-sys-surface);
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 12px;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      .head mat-icon {
        color: var(--mat-sys-primary);
      }
      .hdr {
        min-width: 0;
      }
      .title {
        font-weight: 500;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
        font-size: 11px;
      }
      .ellipsis {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .scroll {
        overflow: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .sec-title {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mat-sys-on-surface-variant);
      }
      .two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .opt-row {
        display: flex;
        gap: 18px;
        align-items: center;
      }
      .label-row {
        gap: 12px;
      }
      .sec-label {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .opts {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .opt-editor {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .opt-editor mat-form-field {
        flex: 1;
      }
      .opt-editor .val-field {
        flex: 0 0 110px;
      }
      .opt-idx {
        width: 18px;
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px;
        text-align: center;
      }
      .add-row {
        display: flex;
        justify-content: flex-end;
      }
      .rules {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .rule {
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 10px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .rule-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .rule-name {
        font-weight: 500;
        font-size: 13px;
      }
      .placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        flex: 1;
        color: var(--mat-sys-on-surface-variant);
        text-align: center;
        padding: 24px;
      }
      .placeholder mat-icon {
        font-size: 42px;
        width: 42px;
        height: 42px;
      }
    `,
  ],
})
export class PropertyPanel {
  readonly store = input.required<DesignerStore>();

  protected readonly WIDTHS = WIDTHS;
  protected readonly INPUT_TYPES = INPUT_TYPES;
  protected readonly VALIDATION_RULE_TYPES = VALIDATION_RULE_TYPES;

  protected el = computed(() => this.store().selectedElement());
  protected meta = computed(() => (this.el() ? fieldMeta(this.el()!.type) : fieldMeta('text')));
  protected emptyGroup = computed(() => ({ logic: 'all' as const, conditions: [], groups: [] }));
  protected fields = computed(() =>
    this.store()
      .form()
      .pages.flatMap((p) => p.elements)
      .filter((e) => e.type !== 'section' && e.type !== 'group')
      .map((e) => ({ id: e.id, label: e.label })),
  );

  private sel(): ElementDefinition {
    const el = this.el();
    if (!el) throw new Error('No selected element');
    return el;
  }

  patch(patch: Partial<ElementDefinition>): void {
    this.store().updateElement(this.sel().id, patch);
  }

str(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  numOrUndef(raw: string): number | undefined {
    const s = String(raw).trim();
    if (s === '') return undefined;
    const n = Number(s);
    return Number.isNaN(n) ? undefined : n;
  }

  num(raw: string): number {
    const n = Number(String(raw).trim());
    return Number.isNaN(n) ? 0 : n;
  }

  stringOrNum(raw: string): string | number {
    const s = String(raw).trim();
    if (s === '') return '';
    const n = Number(s);
    return s !== '' && !Number.isNaN(n) && /^-?\d*\.?\d+$/.test(s) ? n : s;
  }

  wantsPlaceholder(el: ElementDefinition): boolean {
    return (
      el.type !== 'boolean' &&
      el.type !== 'signature' &&
      el.type !== 'scale' &&
      el.type !== 'choice' &&
      el.type !== 'dropdown' &&
      el.type !== 'multiChoice'
    );
  }

  isChoice(el: ElementDefinition): el is ChoiceElement {
    return el.type === 'choice' || el.type === 'dropdown' || el.type === 'multiChoice';
  }

  private choice(): ChoiceElement {
    const el = this.sel();
    if (!this.isChoice(el)) throw new Error('Not a choice');
    return el;
  }

  patchOption(index: number, patch: Partial<{ label: string; value: string | number }>): void {
    const choice = this.choice();
    const options = choice.options.map((o, i) => (i === index ? { ...o, ...patch } : o));
    this.patch({ options });
  }

  addOption(): void {
    const choice = this.choice();
    const idx = choice.options.length + 1;
    this.patch({
      options: [...choice.options, { id: uuid(), label: `Option ${idx}`, value: idx }],
    });
  }

  removeOption(index: number): void {
    const choice = this.choice();
    this.patch({ options: choice.options.filter((_, i) => i !== index) });
  }

  moveOption(index: number, dir: -1 | 1): void {
    const choice = this.choice();
    const next = [...choice.options];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    this.patch({ options: next });
  }

  // ---- default value ----------------------------------------------------------

  widthValue(w: number | 'full' | 'half' | 'third' | undefined): 'full' | 'half' | 'third' {
    if (w === 'full' || w === 'half' || w === 'third') return w;
    return 'full';
  }

  setWidth(value: string | number): void {
    if (value === 'full' || value === 'half' || value === 'third') {
      this.patch({ width: value });
    }
  }

  defaultKind(el: ElementDefinition): 'none' | 'static' | 'expression' | 'fromField' {
    return el.defaultValue?.kind ?? 'none';
  }

  setDefaultKind(kind: string): void {
    const make = (): DefaultValueDef | undefined => {
      switch (kind) {
        case 'static':
          return { kind: 'static', value: null };
        case 'expression':
          return { kind: 'expression', expression: '' };
        case 'field':
          return { kind: 'fromField', fieldId: this.fields()[0]?.id ?? '', transform: 'identity' };
        default:
          return undefined;
      }
    };
    this.patch({ defaultValue: make() });
  }

  staticText(el: ElementDefinition): string {
    const v = el.defaultValue?.kind === 'static' ? el.defaultValue.value : null;
    return v === null || v === undefined ? '' : String(v);
  }

  setStatic(raw: string): void {
    this.patch({ defaultValue: { kind: 'static', value: this.stringOrNum(raw) } });
  }

  exprText(el: ElementDefinition): string {
    return el.defaultValue?.kind === 'expression' ? el.defaultValue.expression : '';
  }

  setExpr(expression: string): void {
    this.patch({ defaultValue: { kind: 'expression', expression } });
  }

  fieldRef(el: ElementDefinition): string {
    return el.defaultValue?.kind === 'fromField' ? el.defaultValue.fieldId : '';
  }

  setFromField(fieldId: string): void {
    this.patch({ defaultValue: { kind: 'fromField', fieldId, transform: 'identity' } });
  }

  // ---- calculation ------------------------------------------------------------

  private numEl(): NumberElement {
    return this.sel() as NumberElement;
  }

  toggleCalc(on: boolean): void {
    this.patch(on ? { calculation: { formula: '' } } : { calculation: undefined });
  }

  setCalc(formula: string): void {
    this.patch({ calculation: { ...this.numEl().calculation!, formula } });
  }

  setCalcDecimals(raw: string): void {
    this.patch({
      calculation: { ...this.numEl().calculation!, decimals: this.numOrUndef(raw) },
    });
  }

  // ---- visibility -------------------------------------------------------------

  hasGroup(el: ElementDefinition): boolean {
    return (
      !!el.enabledWhen && (!!el.enabledWhen.conditions.length || !!el.enabledWhen.groups.length)
    );
  }

  clearGroup(): void {
    this.patch({ enabledWhen: undefined });
  }

  // ---- validation -------------------------------------------------------------

  ruleLabel(rule: ValidationRuleType): string {
    return VALIDATION_RULE_TYPES.find((r) => r.type === rule)?.label ?? rule;
  }

  ruleInputKind(
    rule: ValidationRuleType,
  ): 'number' | 'text' | 'range' | 'pattern' | 'date' | 'accept' | 'expression' | 'none' {
    switch (rule) {
      case 'minLength':
      case 'maxLength':
      case 'min':
      case 'max':
      case 'minFiles':
      case 'maxFiles':
      case 'fileSizeMaxMb':
        return 'number';
      case 'between':
        return 'range';
      case 'pattern':
        return 'pattern';
      case 'dateMin':
      case 'dateMax':
        return 'date';
      case 'fileType':
        return 'accept';
      case 'custom':
        return 'expression';
      case 'required':
      case 'email':
      case 'url':
      case 'phone':
      case 'integer':
      case 'number':
        return 'none';
      default:
        return 'text';
    }
  }

  defaultRuleMessage(rule: ValidationRuleType): string {
    return `This field fails the "${this.ruleLabel(rule)}" check.`;
  }

  addRule(type: ValidationRuleType): void {
    const el = this.sel();
    this.patch({ validations: [...(el.validations ?? []), validationRule(type)] });
  }

  removeRule(id: string): void {
    const el = this.sel();
    this.patch({ validations: (el.validations ?? []).filter((r) => r.id !== id) });
  }

  patchRule(id: string, patch: Partial<ValidationRule>): void {
    const el = this.sel();
    this.patch({
      validations: (el.validations ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  }
}
