import { computed, signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import {
  type FormDefinition,
  type ElementDefinition,
  QUESTION_TYPES,
  QuestionDefinition,
  QuestionType,
  ElementViewRef,
  RunnerPage,
  SubmissionResult,
} from '@shared/model/form.model';
import type { FieldValue, ValuesMap } from '@shared/model/values.model';
import { FormEvaluator, type FormEvaluation } from './form-evaluator';
import { evalExpression } from '../engine/expression/evaluator';
import { validateElementValue } from '../engine/validators';
import type { Submission } from '@shared/model/submission.model';
import { collectElementRefs } from '../engine/dependencies';
import { uuid } from '@shared/model/ids';
import { filter, debounceTime } from 'rxjs';
import { RunnerDraft } from './runner-draft';



export class RunnerStore {
  readonly form = signal<FormDefinition | null>(null);
  readonly answers = new FormGroup({});
  readonly pageIndex = signal(0);
  readonly submitted = signal(false);
  readonly evaluation = signal<FormEvaluation | null>(null);
  readonly restoredDraft = signal(false);

  readonly startedAt = signal(Date.now());
  readonly durationMs = signal(0);

  readonly pages = computed<RunnerPage[]>(() => this.buildPages(this.evaluation()));
  readonly currentPage = computed<RunnerPage | null>(() => this.pages()[this.pageIndex()] ?? null);
  readonly activePages = computed(() => this.pages().filter((p) => p.visible));
  readonly progress = computed(() => {
    const active = this.activePages();
    const idx = active.findIndex((p) => p.id === this.currentPage()?.id);
    return { index: Math.max(0, idx), total: Math.max(1, active.length) };
  });

  readonly canPrev = computed(() => this.pageIndex() > 0 && !!this.form()?.settings.allowBack);
  readonly isLast = computed(
    () =>
      this.pageIndex() >= this.pages().length - 1 ||
      this.activePages().at(-1)?.id === this.currentPage()?.id,
  );

  /** Combined raw values of all controls (including hidden). */
  readonly values = computed<ValuesMap>(() => this.rawValues());

  private evaluator: FormEvaluator;
  private readonly draft = new RunnerDraft();
  private previousValues: ValuesMap = {};
  private defaultsInitDone = false;
  private changeSub: { unsubscribe: () => void } | null = null;
  private draftSub: { unsubscribe: () => void } | null = null;

  constructor() {
    this.evaluator = new FormEvaluator(this.emptyForm());
  }

  private emptyForm(): FormDefinition {
    return {
      id: 'empty',
      name: 'Empty',
      version: 1,
      schemaVersion: 1,
      settings: { navigation: 'auto' },
      pages: [],
    };
  }

  init(form: FormDefinition, initialValues?: ValuesMap): void {
    this.form.set(form);
    this.evaluator.setForm(form);
    this.pageIndex.set(0);
    this.submitted.set(false);
    this.startedAt.set(Date.now());

    const draft = this.loadDraft(form);
    this.restoredDraft.set(!!draft && Object.keys(draft).length > 0);
    const restoreValues: ValuesMap | undefined = initialValues ?? draft ?? undefined;

    this.rebuildControls(form, restoreValues);

    this.changeSub?.unsubscribe();
    this.changeSub = this.answers.valueChanges
      .pipe(
        debounceTime(0),
        filter(() => !!this.form()),
      )
      .subscribe(() => this.onValuesChanged());

    this.draftSub?.unsubscribe();
    this.draftSub = this.answers.valueChanges
      .pipe(
        debounceTime(300),
        filter(() => !!this.form()),
      )
      .subscribe(() => this.saveDraft());

    // First evaluation pass.
    this.updateInternal(form, this.rawValues());
    this.defaultsInitDone = true;

    if (restoreValues) {
      for (const [id, value] of Object.entries(restoreValues)) {
        this.answers.get(id)?.setValue(value, { emitEvent: false });
      }
    }
  }

  dispose(): void {
    this.changeSub?.unsubscribe();
    this.changeSub = null;
    this.draftSub?.unsubscribe();
    this.draftSub = null;
  }

  // ---- draft persistence (temporary localStorage autosave) -------------------

  /** Persist the current answers immediately (normally triggered on changes). */
  saveDraft(): void {
    const form = this.form();
    if (!form) return;
    this.draft.save(form, this.rawValues());
  }

  private loadDraft(form: FormDefinition): ValuesMap | null {
    return this.draft.load(form);
  }

  private clearDraft(): void {
    const form = this.form();
    if (!form) return;
    this.draft.clear(form);
  }

  private rebuildControls(form: FormDefinition, initialValues?: ValuesMap): void {
    const incoming = new Map<string, FormControl>();
    walkQuestions(form, (el) => {
      const existing = this.answers.get(el.id);
      if (existing) {
        incoming.set(el.id, existing as FormControl);
        return;
      }
      const initial = initialValues?.[el.id] ?? this.evalInitialDefault(el, initialValues ?? {});

      if (QUESTION_TYPES.includes(el.type as QuestionType)) {
        const q = el as QuestionDefinition;
        const control = new FormControl(initial, (c: { value: FieldValue }) =>
          this.validateControl(q, c.value),
        );
        if (q.readonly) control.disable({ emitEvent: false });
        incoming.set(el.id, control);
      } else {
        // Dummy FormControl
        incoming.set(el.id, new FormControl());
      }
    });

    for (const key of Object.keys(this.answers.controls)) {
      if (!incoming.has(key)) this.answers.removeControl(key);
    }
    for (const [key, control] of incoming) {
      if (!this.answers.get(key)) this.answers.setControl(key, control);
    }
  }

  private validateControl(el: QuestionDefinition, value: FieldValue) {
    const result = validateElementValue(el, value, this.rawValues());
    if (result.valid) return null;
    return { message: result.failures[0]?.message ?? 'Invalid value' };
  }

  rawValues(): ValuesMap {
    const out: Record<string, FieldValue> = {};
    for (const [id, control] of Object.entries(this.answers.controls)) {
      out[id] = (control as FormControl).getRawValue() ?? null;
    }
    return out;
  }

  /**
   * Recompute derived state (visibility, labels, calculations, dynamic
   * defaults). `incremental` reuse depends on the diff computed here.
   */
  onValuesChanged(): void {
    const form = this.form();
    if (!form) return;
    const now = this.rawValues();
    const diff: string[] = [];
    for (const id of Object.keys(now)) {
      if (!equal(this.previousValues[id] ?? null, now[id] ?? null)) diff.push(id);
    }
    if (diff.length === 0) return;
    this.updateInternal(form, now, diff);
  }

  private updateInternal(
    form: FormDefinition,
    values: ValuesMap,
    diff: string[] | 'all' = 'all',
  ): void {
    const evalResult = this.evaluator.compute(values, diff === 'all' ? [] : diff);

    // Apply dynamic defaults
    if (this.defaultsInitDone) {
      walkQuestions(form, (el) => {
        if (!('defaultValue' in el)) return;
        const dv = el.defaultValue;
        if (!dv || dv.kind === 'static') return;
        const control = this.answers.get(el.id);
        if (!control || control.touched) return;
        const deps = collectElementRefs(el);
        if (diff !== 'all' && !deps.some((d) => diff.includes(d))) return;
        const value =
          dv.kind === 'fromField'
            ? (values[dv.fieldId] ?? null)
            : (evalExpression(dv.expression, values) as FieldValue);
        if (!equal(control.getRawValue(), value)) {
          control.setValue(value, { emitEvent: false });
        }
      });
    }

    this.previousValues = values;
    this.evaluation.set(evalResult);
  }

  // ---- navigation ------------------------------------------------------------

  goTo(index: number): void {
    const pages = this.pages();
    const target = pages[index];
    if (!target || !target.visible) return;
    this.pageIndex.set(index);
  }

  /** Advance to the next visible page; validates current one. Returns false when blocked. */
  next(): boolean {
    const pages = this.pages();
    for (const page of [pages[this.pageIndex()]]) {
      if (!this.validatePage(page)) return false;
    }
    for (let i = this.pageIndex() + 1; i < pages.length; i++) {
      if (pages[i].visible) {
        this.pageIndex.set(i);
        return true;
      }
    }
    return false;
  }

  prev(): void {
    const pages = this.pages();
    for (let i = this.pageIndex() - 1; i >= 0; i--) {
      if (pages[i].visible) {
        this.pageIndex.set(i);
        return;
      }
    }
  }

  isPageValid(page: RunnerPage): boolean {
    return this.validatePage(page);
  }

  markPageTouched(page: RunnerPage): void {
    for (const ref of page.elements) ref.control.markAsTouched({ onlySelf: true });
  }

  private validatePage(page: RunnerPage): boolean {
    let valid = true;
    for (const ref of page.elements) {
      const control = ref.control;
      if (control.disabled) continue;
      control.markAsTouched({ onlySelf: true });
      control.updateValueAndValidity({ onlySelf: true });
      if (control.errors) valid = false;
    }
    return valid;
  }

  // ---- submission ------------------------------------------------------------

  canSubmit(): boolean {
    for (const page of this.pages()) {
      if (!page.visible) continue;
      if (!this.validatePage(page)) return false;
    }
    return true;
  }

  submit(): SubmissionResult | null {
    if (!this.canSubmit()) return null;
    const form = this.form();
    const evalResult = this.evaluation();
    if (!form || !evalResult) return null;

    const values: Record<string, FieldValue> = {};
    const visibleAnswerKeys: string[] = [];

    const collectGroup = (group: ElementDefinition, parentVisible: boolean): void => {
      if (group.type !== 'group') return;
      for (const child of group.elements) {
        const childView = evalResult.byId.get(child.id);
        const visible = parentVisible && !!childView?.visible;
        if (child.type === 'group') {
          collectGroup(child, visible);
          continue;
        }
        if (child.type === 'section' || !visible) continue;
        const control = this.answers.get(child.id);
        values[child.id] = control ? ((control.getRawValue() as FieldValue) ?? null) : null;
        visibleAnswerKeys.push(child.id);
      }
    };

    for (const page of evalResult.pages) {
      if (!page.visible) continue;
      for (const view of page.elements) {
        if (!view.visible) continue;
        if (view.element.type === 'group') {
          collectGroup(view.element, true);
          continue;
        }
        if (view.element.type === 'section') continue;
        const control = view.id ? this.answers.get(view.id) : null;
        const value = control ? control.getRawValue() : view.value;
        values[view.id] = value ?? null;
        visibleAnswerKeys.push(view.id);
      }
    }

    const submission: Submission = {
      id: uuid(),
      formId: form.id,
      formVersion: form.version,
      formName: form.name,
      submittedAt: new Date().toISOString(),
      durationMs: Date.now() - this.startedAt(),
      values,
    };

    this.durationMs.set(submission.durationMs);
    this.submitted.set(true);
    this.clearDraft();
    return { submission, visibleAnswerKeys };
  }

  reset(): void {
    for (const control of Object.values(this.answers.controls)) {
      const ctrl = control as FormControl;
      ctrl.reset(null, { emitEvent: false });
      ctrl.markAsUntouched();
    }
    this.pageIndex.set(0);
    this.submitted.set(false);
    this.startedAt.set(Date.now());
    this.previousValues = {};
    this.clearDraft();
    this.onValuesChanged();
  }

  setAnswer(
    id: string,
    value: FieldValue,
    options: { emitEvent?: boolean; markTouched?: boolean } = {},
  ): void {
    const control = this.answers.get(id);
    if (!control) return;
    control.setValue(value, { emitEvent: options.emitEvent ?? true });
    if (options.markTouched) control.markAsTouched({ onlySelf: true });
  }

  // ---- view model ------------------------------------------------------------

  private buildPages(evaluation: FormEvaluation | null): RunnerPage[] {
    if (!evaluation) return [];
    const out: RunnerPage[] = [];
    for (const pv of evaluation.pages) {
      const refs: ElementViewRef[] = [];
      const collect = (el: ElementDefinition): ElementViewRef | undefined => {
        const view = evaluation.byId.get(el.id);
        const control = this.answers.get(el.id) as FormControl;
        if (!view || !control) return undefined;

        if (el.type === 'group') {
          el.elementsRef = el.elements.map(collect).filter((x) => !!x) ?? [];
          return {
            id: el.id,
            el,
            label: view?.label,
            description: el.description ?? '',
            visible: view.visible,
            control: control,
          };
        }
        return {
          id: el.id,
          el,
          label: view.label,
          description: view.description,
          placeholder: view.placeholder,
          visible: view.visible,
          control,
        };
      };

      pv.elements.forEach((v) => {
        const collected = collect(v.element);
        if (collected) refs.push(collected);
      });
      out.push({
        id: pv.page.id,
        title: pv.page.title ?? `Page ${out.length + 1}`,
        subtitle: pv.page.subtitle ?? '',
        index: out.length,
        visible: pv.visible,
        elements: refs,
      });
    }
    return out;
  }

  private evalInitialDefault(el: ElementDefinition, values: ValuesMap): FieldValue {
    const dv = 'defaultValue' in el && el.defaultValue;
    if (!dv) return null;
    if (dv.kind === 'static') return dv.value ?? null;
    if (dv.kind === 'fromField') return values[dv.fieldId] ?? null;
    try {
      return evalExpression(dv.expression, values) as FieldValue;
    } catch {
      return null;
    }
  }
}

function equal(a: FieldValue, b: FieldValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function walkQuestions(form: FormDefinition, fn: (el: ElementDefinition) => void): void {
  for (const page of form.pages) {
    const walk = (els: ElementDefinition[]) => {
      for (const el of els) {
        fn(el);
        if (el.type === 'group') walk(el.elements);
      }
    };
    walk(page.elements);
  }
}

export type RunnerValues = ValuesMap;
