import type {
  FormDefinition,
  ElementDefinition,
  PageDefinition,
} from '../../shared/model/form.model';
import type { FieldValue, ValuesMap } from '../../shared/model/values.model';
import { evalConditionGroup } from '../engine/condition-engine';
import { evalExpression } from '../engine/expression/evaluator';
import { interpolateTemplate } from '../engine/expression/template';
import { collectElementRefs } from '../engine/dependencies';

export interface ElementView {
  id: string;
  element: ElementDefinition;
  visible: boolean;
  label: string;
  description: string;
  placeholder: string;
  /** true when the value is produced by a calculation (read-only). */
  computed: boolean;
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

  constructor(private form: FormDefinition) {
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
    for (const page of this.form.pages) {
      for (const el of page.elements) {
        const deps = collectElementRefs(el);
        this.depsById.set(el.id, deps);
        for (const dep of deps) {
          const list = this.dependents.get(dep);
          if (list) list.push(el.id);
          else this.dependents.set(dep, [el.id]);
        }
      }
    }
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

    for (const page of this.form.pages) {
      const pageVisible = evalConditionGroup(page.enabledWhen, values);
      const views: ElementView[] = [];
      for (const el of page.elements) {
        const view = this.evaluateElement(el, values);
        views.push(view);
        byId.set(el.id, view);
        if (el.type === 'group') {
          for (const gel of el.elements) {
            const gview = this.evaluateElement(gel, values);
            byId.set(gel.id, gview);
          }
        }
      }
      pages.push({ page, visible: pageVisible, elements: views });
    }

    // Calculate cascade (topological order across the whole form).
    this.applyCalculations(pages, values);

    return { pages, byId };
  }

  private evaluateElement(el: ElementDefinition, values: ValuesMap): ElementView {
    const cached = this.cache.get(el.id);
    if (cached && cached.rev === this.rev) return cached.view;

    const visible = evalConditionGroup(el.enabledWhen, values);
    const label = interpolateTemplate(el.label, values);
    const description = el.description ? interpolateTemplate(el.description, values) : '';
    const placeholder = el.placeholder ? interpolateTemplate(el.placeholder, values) : '';

    const view: ElementView = {
      id: el.id,
      element: el,
      visible,
      label,
      description,
      placeholder,
      computed: this.isComputed(el),
      value: values[el.id] ?? null,
      deps: this.depsById.get(el.id) ?? [],
    };
    this.cache.set(el.id, { rev: this.rev, view });
    return view;
  }

  private isComputed(el: ElementDefinition): boolean {
    return el.type === 'number' && !!el.calculation;
  }

  private applyCalculations(pages: PageView[], values: ValuesMap): void {
    const flat: { id: string; el: ElementDefinition; view: ElementView }[] = [];
    for (const pg of pages)
      for (const v of pg.elements) flat.push({ id: v.id, el: v.element, view: v });

    // Topological sort where edges el -> its dependencies (dependencies must run first).
    const sorted = topoSort(
      flat.map((f) => f.id),
      (id) => this.depsById.get(id) ?? [],
    );

    for (const id of sorted) {
      const entry = flat.find((f) => f.id === id);
      if (!entry) continue;
      const view = entry.view;
      if (!view.computed) continue;
      const calc = (entry.el as { calculation?: { formula?: string; decimals?: number } })
        .calculation;
      if (!calc?.formula) continue;
      const result = evalExpression(calc.formula, values);
      if (typeof result === 'number') {
        view.value = calc.decimals !== undefined ? Number(result.toFixed(calc.decimals)) : result;
      } else if (typeof result === 'string' || typeof result === 'boolean') {
        view.value = result;
      } else if (Array.isArray(result)) {
        view.value = result
          .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
          .map(String);
      } else {
        view.value = null;
      }
    }
  }
}

/** Kahn topological sort; cycles fall back to original order. */
function topoSort(ids: string[], depsOf: (id: string) => string[]): string[] {
  const index = new Map<string, number>(ids.map((id, i) => [id, i]));
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));

  for (const id of ids) {
    for (const dep of depsOf(id)) {
      const target = index.get(dep);
      if (target === undefined) continue; // dep is not an element (e.g. page-level ref)
      indegree.set(id, (indegree.get(id) ?? 0) + 1);
      adj.get(dep)?.push(id);
    }
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    out.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
    queue.sort();
  }
  return out.length === ids.length ? out : ids;
}
