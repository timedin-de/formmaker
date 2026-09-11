import { collectReferences, parse } from './parser';
import type { Expr, ExprValue, Primitive } from './ast';
import type { FieldValue } from '../../model/values.model';

export type EvalContext = Readonly<Record<string, FieldValue>>;

export type ExprFunction = (...args: ExprValue[]) => ExprValue | string[] | number[];

export type FunctionLibrary = Record<string, ExprFunction>;

export const DEFAULT_FUNCTIONS: FunctionLibrary = {
  // -- aggregation / arithmetic -------------------------------------------------
  sum: (...ns) => sumNum(numbers(flatten(ns))),
  avg: (...ns) => {
    const flat = numbers(flatten(ns));
    return flat.length ? flat.reduce((a, b) => a + b, 0) / flat.length : null;
  },
  min: (...ns) => {
    const flat = numbers(flatten(ns));
    return flat.length ? Math.min(...flat) : null;
  },
  max: (...ns) => {
    const flat = numbers(flatten(ns));
    return flat.length ? Math.max(...flat) : null;
  },
  count: (...ns) => flatten(ns).filter((v) => v !== null && v !== undefined).length,
  round: (x, digits) => {
    const n = toNumber(x);
    const d = digits === undefined ? 0 : (toNumber(digits) ?? 0);
    return n === null ? null : Math.round(n * 10 ** d) / 10 ** d;
  },
  floor: (x) => {
    const n = toNumber(x);
    return n === null ? null : Math.floor(n);
  },
  ceil: (x) => {
    const n = toNumber(x);
    return n === null ? null : Math.ceil(n);
  },
  abs: (x) => {
    const n = toNumber(x);
    return n === null ? null : Math.abs(n);
  },

  // -- string helpers ------------------------------------------------------------
  concat: (...parts) =>
    flatten(parts)
      .map((p) => (p == null ? '' : String(p)))
      .join(''),
  length: (x) => {
    const s = x === null || x === undefined ? null : String(x);
    return s === null ? null : s.length;
  },
  lower: (x) => (x == null ? null : String(x).toLowerCase()),
  upper: (x) => (x == null ? null : String(x).toUpperCase()),
  trim: (x) => (x == null ? null : String(x).trim()),
  replace: (x, from, to) => {
    if (x == null || from == null) return x == null ? null : String(x);
    return String(x)
      .split(String(from))
      .join(to == null ? '' : String(to));
  },
  toText: (x) => (x == null ? '' : String(x)),

  // -- predicates ----------------------------------------------------------------
  contains: (x, needle) =>
    x != null && needle != null && String(x).toLowerCase().includes(String(needle).toLowerCase()),
  startsWith: (x, needle) => x != null && String(x).startsWith(String(needle)),
  endsWith: (x, needle) => x != null && String(x).endsWith(String(needle)),
  matches: (x, re) => {
    try {
      return x != null && new RegExp(String(re), 'i').test(String(x));
    } catch {
      return false;
    }
  },
  isEmpty: (x) => isEmptyValue(x),
  isNotEmpty: (x) => !isEmptyValue(x),

  // -- conditional / value -------------------------------------------------------
  if: (cond, a, b) => (truthy(cond) ? a : b),
  coalesce: (...ns) => flatten(ns).find((v) => v !== null && v !== undefined) ?? null,

  // -- dates ---------------------------------------------------------------------
  now: () => new Date().toISOString(),
  dateDiff: (a, b) => {
    const da = parseDate(a);
    const db = parseDate(b);
    if (da === null || db === null) return null;
    return Math.round((db.getTime() - da.getTime()) / 86400000);
  },
  yearsBetween: (a, b) => {
    const da = parseDate(a);
    const db = parseDate(b);
    if (da === null || db === null) return null;
    return db.getFullYear() - da.getFullYear();
  },

  // -- validation-oriented (used by validators) -----------------------------------
  /** fail-helper: returns the string message — a custom validator flags non-empty strings as failures. */
  msg: (...parts) => parts.map((p) => (p == null ? '' : String(p))).join(' '),
  required: (x) => !isEmptyValue(x),
};

function flatten(values: ExprValue[]): ExprValue[] {
  const out: ExprValue[] = [];
  for (const v of values) {
    if (Array.isArray(v))
      out.push(
        ...v.map((item) =>
          typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
            ? item
            : String(item),
        ),
      );
    else out.push(v);
  }
  return out;
}

function numbers(values: ExprValue[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    const n = toNumber(v);
    if (n !== null) out.push(n);
  }
  return out;
}

function sumNum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Maps a FieldValue (which may hold objects) onto engine-safe primitives/arrays. */
export function toExprValue(value: FieldValue): ExprValue {
  if (value === null) return null;
  const simple =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  if (simple) return value as Primitive;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
        return item;
      if ('name' in item) return item.name;
      return '';
    }) as Primitive[];
  }
  if ('dataUrl' in value) return null;
  return null;
}

export function isEmptyValue(value: ExprValue | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return true;
  return false;
}

export function truthy(value: ExprValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

const EPS = 1e-10;

export class ExpressionEvaluator {
  constructor(
    private readonly context: EvalContext,
    private readonly functions: FunctionLibrary = DEFAULT_FUNCTIONS,
  ) {}

  evaluate(expr: Expr): ExprValue {
    switch (expr.type) {
      case 'literal':
        return expr.value;
      case 'identifier':
        return this.resolve(expr.name);
      case 'unary':
        return this.evaluateUnary(expr);
      case 'binary':
        return this.evaluateBinary(expr);
      case 'call':
        return this.evaluateCall(expr);
    }
  }

  private resolve(name: string): ExprValue {
    return toExprValue(this.context[name] ?? null);
  }

  private evaluateUnary(expr: Extract<Expr, { type: 'unary' }>): ExprValue {
    const operand = this.evaluate(expr.operand);
    if (expr.op === '!') return !truthy(operand);
    const n = toNumber(operand);
    return n === null ? null : -n;
  }

  private evaluateCall(expr: Extract<Expr, { type: 'call' }>): ExprValue {
    const fn = this.functions[expr.name.toLowerCase()];
    if (!fn) throw new Error(`Unknown function '${expr.name}'`);
    const args = expr.args.map((a) => this.evaluate(a));
    return fn(...args) as ExprValue;
  }

  private evaluateBinary(expr: Extract<Expr, { type: 'binary' }>): ExprValue {
    const { op } = expr;

    if (op === '&&') {
      const left = this.evaluate(expr.left);
      if (!truthy(left)) return false;
      return truthy(this.evaluate(expr.right));
    }
    if (op === '||') {
      const left = this.evaluate(expr.left);
      if (truthy(left)) return true;
      return truthy(this.evaluate(expr.right));
    }

    const left = this.evaluate(expr.left);
    const right = this.evaluate(expr.right);

    switch (op) {
      case '+': {
        const a = left;
        const b = right;
        if (typeof a === 'string' || typeof b === 'string') {
          return String(a ?? '') + String(b ?? '');
        }
        return numBin(a, b, (x, y) => x + y);
      }
      case '-':
        return numBin(left, right, (x, y) => x - y);
      case '*':
        return numBin(left, right, (x, y) => x * y);
      case '/':
        return numBin(left, right, (x, y) => (y === 0 ? Number.NaN : x / y));
      case '%':
        return numBin(left, right, (x, y) => (y === 0 ? Number.NaN : x % y));
      case '^':
        return numBin(left, right, (x, y) => Math.pow(x, y));
      case '==':
        return looseEquals(left, right);
      case '!=':
        return !looseEquals(left, right);
      case '~=':
        return looseEquals(collapse(nullify(left)), collapse(nullify(right)));
      case '<':
      case '<=':
      case '>':
      case '>=':
        return compare(left, right, op);
    }
  }
}

function collapse(value: ExprValue): ExprValue {
  if (typeof value === 'string') return value.trim().toLowerCase();
  return value;
}

function nullify(value: ExprValue): ExprValue {
  return value === null ? '' : value;
}

/** Numeric binary op with null propagation (null + anything = null). */
function numBin(a: ExprValue, b: ExprValue, op: (x: number, y: number) => number): number | null {
  const x = toNumber(a);
  const y = toNumber(b);
  if (x === null || y === null) return null;
  const result = op(x, y);
  if (!Number.isFinite(result)) return null;
  return Math.round(result / EPS) * EPS;
}

function looseEquals(a: ExprValue, b: ExprValue): boolean {
  if (a === null || b === null) return a === null && b === null;
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na === nb;
  return String(a) === String(b);
}

function compare(a: ExprValue, b: ExprValue, op: '<' | '<=' | '>' | '>='): boolean {
  if (a === null || b === null) return false;
  const na = toNumber(a);
  const nb = toNumber(b);
  let relation: number;
  if (na !== null && nb !== null) {
    relation = na - nb;
  } else {
    relation = String(a).localeCompare(String(b));
  }
  switch (op) {
    case '<':
      return relation < 0;
    case '<=':
      return relation <= 0;
    case '>':
      return relation > 0;
    case '>=':
      return relation >= 0;
  }
}

/**
 * Parse + evaluate an expression against a values context.
 * Throws on syntax errors; resolves unknown identifiers to null.
 */
export function evalExpression(
  src: string,
  context: EvalContext,
  functions: FunctionLibrary = DEFAULT_FUNCTIONS,
): ExprValue {
  const expr = parse(src);
  return new ExpressionEvaluator(context, functions).evaluate(expr);
}

/** List the field ids referenced by an expression string. */
export function expressionReferences(src: string): string[] {
  try {
    return [...collectReferences(parse(src))];
  } catch {
    return [];
  }
}
