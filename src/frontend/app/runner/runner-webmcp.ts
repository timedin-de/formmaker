import {
  ChangeDetectorRef,
  declareExperimentalWebMcpTool,
  inject,
  type WebMcpToolDescriptor,
} from '@angular/core';
import { has, isQuestion } from '@shared/helper';
import type { QuestionDefinition } from '@shared/model/form.model';
import type { FieldValue } from '@shared/model/values.model';
import type { ElementViewRef, RunnerPage } from '../core/state/runner.model';
import type { RunnerStore } from '../core/state/runner.store';

/**
 * WebMCP tools of the form runner: they let an in-browser AI agent read the
 * open form, fill in answers, move between pages and submit, using the same
 * store, validation and navigation rules as the UI.
 *
 * Tool names, descriptions and results are read by agents, not shown in the UI,
 * so they are not translated.
 */

/** What the tools need from the runner component. */
export interface RunnerWebMcpHost {
  readonly store: RunnerStore;
  /** Whether the current fill-in has been submitted (thank-you screen). */
  isSubmitted(): boolean;
  /** Show the page with this index and sync the `?page=` query parameter. */
  showPage(index: number): void;
  /** Submit like the submit button does (validation, API call, thank-you screen). */
  submit(): Promise<void>;
  /** Called after a tool changed answers or touched states, to re-render. */
  changed(): void;
}

/** Question types an agent cannot answer with a plain JSON value. */
const UNSUPPORTED_TYPES: ReadonlySet<QuestionDefinition['type']> = new Set(['file', 'signature']);

const VALUE_FORMAT: Record<QuestionDefinition['type'], string> = {
  text: 'string',
  longText: 'string',
  number: 'number',
  date: 'string yyyy-MM-dd',
  time: 'string HH:mm',
  dateTime: 'string yyyy-MM-ddTHH:mm (local time, no zone)',
  boolean: 'true or false',
  choice: 'one option id (string)',
  dropdown: 'one option id (string)',
  multiChoice: 'array of option ids',
  scale: 'number between min and max, in steps of step',
  file: 'not settable by agents',
  signature: 'not settable by agents',
};

export interface AgentQuestion {
  id: string;
  type: QuestionDefinition['type'];
  label: string;
  description?: string;
  /** Label of the enclosing group, when the question is inside one. */
  group?: string;
  required: boolean;
  readonly: boolean;
  valueFormat: string;
  options?: { id: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  value: FieldValue | { attachments: number };
  error?: string;
}

export interface AgentPage {
  index: number;
  title: string;
  current: boolean;
  questions: AgentQuestion[];
}

export interface AgentFormState {
  name: string;
  description?: string;
  submitted: boolean;
  currentPage: number;
  isLastPage: boolean;
  canGoBack: boolean;
  /** Visible pages only; hidden pages and hidden questions are left out. */
  pages: AgentPage[];
}

const NO_ARGS = { type: 'object', properties: {} } as const;

const ANSWER_VALUE_SCHEMA = {
  type: ['string', 'number', 'boolean', 'array', 'null'],
  items: { type: 'string' },
  description: 'The answer in the question\'s "valueFormat"; null clears it.',
} as const;

/** Builds the runner's tool descriptors (without registering them). */
export function runnerWebMcpTools(host: RunnerWebMcpHost) {
  const { store } = host;

  const getForm: WebMcpToolDescriptor<typeof NO_ARGS> = {
    name: 'formmaker_get_form',
    description:
      'Returns the form that is open in the runner: its visible pages and, per question, the id, ' +
      'type, label, whether it is required, the expected value format, choice options, the current ' +
      'value and the current validation error. Call this first, and again after setting answers, ' +
      'because answers can show or hide other questions and pages.',
    inputSchema: NO_ARGS,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => json(formState(host)),
  };

  const setAnswersSchema = {
    type: 'object',
    properties: {
      answers: {
        type: 'array',
        description: 'Answers to set, by question id from formmaker_get_form.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Question id.' },
            value: ANSWER_VALUE_SCHEMA,
          },
          required: ['id', 'value'],
        },
      },
    },
    required: ['answers'],
  } as const;

  const setAnswers: WebMcpToolDescriptor<typeof setAnswersSchema> = {
    name: 'formmaker_set_answers',
    description:
      'Fills in answers of the open form, as the user would by typing or picking. Questions on ' +
      'any visible page can be answered. Returns, per answer, whether it was applied and the ' +
      'validation error it now shows, if any. Does not submit.',
    inputSchema: setAnswersSchema,
    execute: ({ answers }) => {
      if (host.isSubmitted()) return json({ error: 'The form was already submitted.' });
      const questions = new Map(visibleQuestionRefs(store).map((ref) => [ref.id, ref]));
      const applied: string[] = [];
      const results: { id: string; applied: boolean; error?: string }[] = [];
      for (const answer of Array.isArray(answers) ? answers : []) {
        const id: unknown = answer?.id;
        const value: unknown = answer?.value;
        const ref = typeof id === 'string' ? questions.get(id) : undefined;
        const problem = !ref ? 'No visible question with this id.' : rejectReason(ref, value);
        if (problem || !ref) {
          results.push({ id: String(id), applied: false, error: problem ?? undefined });
          continue;
        }
        store.setAnswer(ref.id, value as FieldValue, { markTouched: true });
        applied.push(ref.id);
      }
      // Errors after all answers are in: rules may compare questions with each other.
      for (const id of applied) {
        const control = store.answers.get(id);
        control?.updateValueAndValidity({ onlySelf: true });
        results.push({ id, applied: true, error: errorOf(control?.errors) });
      }
      host.changed();
      return json({ results });
    },
  };

  const goToPageSchema = {
    type: 'object',
    properties: {
      page: { type: 'integer', description: 'Page index from formmaker_get_form.' },
    },
    required: ['page'],
  } as const;

  const goToPage: WebMcpToolDescriptor<typeof goToPageSchema> = {
    name: 'formmaker_go_to_page',
    description:
      'Shows another visible page of the open form so the user can follow along. Moving forward ' +
      'requires the pages in between to be valid; moving back is only possible when the form ' +
      'allows it. Returns the validation errors that blocked the move, if any.',
    inputSchema: goToPageSchema,
    execute: ({ page }) => {
      if (host.isSubmitted()) return json({ error: 'The form was already submitted.' });
      const pages = store.pages();
      const target = pages[page];
      if (!Number.isInteger(page) || !target?.visible) {
        return json({ error: 'No visible page with this index.' });
      }
      const current = store.pageIndex();
      if (page < current && !store.canPrev()) {
        return json({ error: 'This form does not allow going back.' });
      }
      for (const p of pages.slice(current, page)) {
        if (!p.visible || store.isPageValid(p)) continue;
        host.showPage(p.index);
        store.markPageTouched(p);
        host.changed();
        return json({ error: 'A page before the target has errors.', errors: pageErrors(p) });
      }
      host.showPage(page);
      return json({ currentPage: page });
    },
  };

  const submit: WebMcpToolDescriptor<typeof NO_ARGS> = {
    name: 'formmaker_submit',
    description:
      'Submits the open form, exactly like pressing its submit button. Only call this after the ' +
      'user has confirmed the answers. Returns the validation errors when the form is incomplete.',
    inputSchema: NO_ARGS,
    annotations: { consequentialHint: true },
    execute: async () => {
      if (host.isSubmitted()) return json({ error: 'The form was already submitted.' });
      await host.submit();
      if (host.isSubmitted()) return json({ submitted: true });
      const errors = store
        .pages()
        .filter((p) => p.visible)
        .flatMap(pageErrors);
      return json(
        errors.length
          ? { submitted: false, error: 'The form has errors.', errors }
          : { submitted: false, error: 'The submission failed.' },
      );
    },
  };

  return { getForm, setAnswers, goToPage, submit };
}

/**
 * Registers the runner's WebMCP tools for the lifetime of the calling component.
 * Must run in an injection context. Does nothing in browsers without WebMCP.
 */
export function declareRunnerWebMcpTools(host: Omit<RunnerWebMcpHost, 'changed'>): void {
  // Agents call tools from outside any template event; make sure touched and
  // error states render even when no signal changed.
  const cdr = inject(ChangeDetectorRef);
  const tools = runnerWebMcpTools({ ...host, changed: () => cdr.markForCheck() });
  // WebMCP is a progressive enhancement: a refused registration (e.g. by a
  // permissions policy) must not break the runner.
  const ignore = () => undefined;
  // One call per tool: each descriptor has its own input schema type.
  void declareExperimentalWebMcpTool(tools.getForm).catch(ignore);
  void declareExperimentalWebMcpTool(tools.setAnswers).catch(ignore);
  void declareExperimentalWebMcpTool(tools.goToPage).catch(ignore);
  void declareExperimentalWebMcpTool(tools.submit).catch(ignore);
}

// ---- helpers ----------------------------------------------------------------

function json(value: unknown): string {
  return JSON.stringify(value);
}

export function formState(host: RunnerWebMcpHost): AgentFormState {
  const { store } = host;
  const form = store.form();
  const current = store.pageIndex();
  return {
    name: form?.name ?? '',
    description: form?.description || undefined,
    submitted: host.isSubmitted(),
    currentPage: current,
    isLastPage: store.isLast(),
    canGoBack: store.canPrev(),
    pages: store
      .pages()
      .filter((p) => p.visible)
      .map((p) => ({
        index: p.index,
        title: p.title,
        current: p.index === current,
        questions: questionRefs(p.elements).map(({ ref, group }) => describeQuestion(ref, group)),
      })),
  };
}

/** Visible questions of the given refs, depth first, with their enclosing group label. */
function questionRefs(
  refs: ElementViewRef[],
  group?: string,
): { ref: ElementViewRef; group?: string }[] {
  return refs.flatMap((ref) => {
    if (!ref.visible) return [];
    if (ref.el.type === 'group') return questionRefs(ref.children, ref.label || group);
    return isQuestion(ref.el) ? [{ ref, group }] : [];
  });
}

function visibleQuestionRefs(store: RunnerStore): ElementViewRef[] {
  return store
    .pages()
    .filter((p) => p.visible)
    .flatMap((p) => questionRefs(p.elements).map(({ ref }) => ref));
}

function describeQuestion(ref: ElementViewRef, group: string | undefined): AgentQuestion {
  const el = ref.el as QuestionDefinition;
  const value = (ref.control.getRawValue() as FieldValue) ?? null;
  return {
    id: ref.id,
    type: el.type,
    label: ref.label,
    description: ref.description || undefined,
    group,
    required: el.required,
    readonly: ref.control.disabled,
    valueFormat: VALUE_FORMAT[el.type],
    options: has(el, 'options') ? el.options.map((o) => ({ id: o.id, label: o.label })) : undefined,
    ...(el.type === 'scale' ? { min: el.min, max: el.max, step: el.step } : {}),
    ...(el.type === 'number' ? { step: el.step, unit: el.unit || undefined } : {}),
    value: UNSUPPORTED_TYPES.has(el.type) ? attachmentSummary(value) : value,
    error: ref.control.touched ? errorOf(ref.control.errors) : undefined,
  };
}

function attachmentSummary(value: FieldValue): { attachments: number } {
  if (Array.isArray(value)) return { attachments: value.length };
  return { attachments: value ? 1 : 0 };
}

/** Why an agent-provided value cannot be applied, or null when it can. */
function rejectReason(ref: ElementViewRef, value: unknown): string | null {
  const el = ref.el as QuestionDefinition;
  if (ref.control.disabled) return 'This question is read-only.';
  if (UNSUPPORTED_TYPES.has(el.type)) return `Questions of type "${el.type}" need the user.`;
  if (!isAgentValue(value))
    return 'Values must be a string, number, boolean, string array or null.';
  return null;
}

function isAgentValue(value: unknown): value is FieldValue {
  if (value === null) return true;
  if (Array.isArray(value)) return value.every((v) => typeof v === 'string');
  return typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value);
}

function errorOf(errors: Record<string, unknown> | null | undefined): string | undefined {
  if (!errors) return undefined;
  const message = errors['message'];
  return typeof message === 'string' ? message : 'Invalid value';
}

function pageErrors(
  page: RunnerPage,
): { page: number; id: string; label: string; error: string }[] {
  return questionRefs(page.elements).flatMap(({ ref }) => {
    const error = ref.control.disabled ? undefined : errorOf(ref.control.errors);
    return error ? [{ page: page.index, id: ref.id, label: ref.label, error }] : [];
  });
}
