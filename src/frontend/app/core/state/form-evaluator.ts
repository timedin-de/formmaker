import { evalConditionGroup, interpolateTemplate, templateValues } from '@shared/engine';
import { has } from '@shared/helper';
import { childrenOf, walkElements } from '@shared/model/form-tree';
import type { ElementDefinition, FormDefinition, PageDefinition } from '@shared/model/form.model';
import type { FieldValue, ValuesMap } from '@shared/model/values.model';
import { collectElementRefs } from '../engine/dependencies';

export interface ElementView {
  id: string;
  element: ElementDefinition;
  visible: boolean;
  label: string;
  description: string;
  placeholder: string;
  /** resolved formula value for computed fields / applied dynamic value. */
  value: FieldValue;
  /** referenced field ids (dependencies). */
  deps: string[];
}

export interface PageView {
  page: PageDefinition;
  visible: boolean;
  elements: ElementView[];
}

export interface FormEvaluation {
  pages: PageView[];
  byId: Map<string, ElementView>;
}

/**
 * Evaluates a form against a set of raw field values.
 *
 * Performance: results are keyed by a revision counter. When only some field
 * values changed, previously computed element views are reused (dependency-aware).
 */
export class FormEvaluator {
  private cache = new Map<string, { rev: number; view: ElementView }>();
  private rev = 0;
  private depsById = new Map<string, string[]>();
  private dependents = new Map<string, string[]>();

  constructor(private form?: FormDefinition) {
    this.rebuild();
  }

  setForm(form: FormDefinition): void {
    this.form = form;
    this.cache.clear();
    this.rebuild();
  }

  private rebuild(): void {
    this.depsById.clear();
    this.dependents.clear();
    if (!this.form) return;
    walkElements(this.form, (el) => {
      const deps = collectElementRefs(el);
      this.depsById.set(el.id, deps);
      for (const dep of deps) {
        const list = this.dependents.get(dep);
        if (list) list.push(el.id);
        else this.dependents.set(dep, [el.id]);
      }
    });
  }

  /** Invalidate cached views for elements affected by the given changed field ids. */
  invalidateAll(): void {
    this.cache.clear();
  }

  private invalidate(changed: string[]): void {
    if (changed.length === 0) return;
    const queue = [...changed];
    const seen = new Set<string>();
    while (queue.length) {
      const id = queue.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      this.cache.delete(id);
      for (const dep of this.dependents.get(id) ?? []) queue.push(dep);
    }
  }

  compute(values: ValuesMap, changed: string[] = []): FormEvaluation {
    this.rev += 1;
    if (changed.length > 0) this.invalidate(changed);

    const byId = new Map<string, ElementView>();
    const pages: PageView[] = [];

    if (!this.form)
      return {
        pages,
        byId,
      };

    const form = this.form;
    const display = templateValues(values, form.elements);
    for (const page of form.pages) {
      const pageVisible = evalConditionGroup(page.enabledWhen, values);
      const views: ElementView[] = [];
      for (const el of childrenOf(form, page)) {
        const view = this.evaluateElement(el, values, display);
        views.push(view);
        byId.set(el.id, view);
        if (el.type === 'group') {
          walkElements(
            form,
            (child) => byId.set(child.id, this.evaluateElement(child, values, display)),
            el,
          );
        }
      }
      pages.push({ page, visible: pageVisible, elements: views });
    }

    return { pages, byId };
  }

  /** `display` holds the values as templates show them (option labels instead of ids). */
  private evaluateElement(
    el: ElementDefinition,
    values: ValuesMap,
    display: ValuesMap,
  ): ElementView {
    const cached = this.cache.get(el.id);
    if (cached && cached.rev === this.rev) return cached.view;

    const visible = evalConditionGroup(el.enabledWhen, values);
    const label = interpolateTemplate(el.label, display);
    const description = el.description ? interpolateTemplate(el.description, display) : '';
    const placeholder = has(el, 'placeholder') ? interpolateTemplate(el.placeholder, display) : '';

    const view: ElementView = {
      id: el.id,
      element: el,
      visible,
      label,
      description,
      placeholder,
      value: values[el.id] ?? null,
      deps: this.depsById.get(el.id) ?? [],
    };
    this.cache.set(el.id, { rev: this.rev, view });
    return view;
  }
}
