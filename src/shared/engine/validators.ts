import { has } from '@shared/helper';
import type { QuestionDefinition } from '@shared/model/form.model';
import type { ValidationRule, ValidationRuleType } from '@shared/model/validation.model';
import type { FieldValue } from '@shared/model/values.model';
import { evalExpression } from './expression/evaluator';
import { compileRegex, type Matcher } from './regex';

interface ValidationFailure {
  ruleId: string;
  type: ValidationRuleType;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  failures: ValidationFailure[];
}

/**
 * Validates a field value against the element's rules.
 * `allValues` carries the current form answers so custom expressions and
 * piped messages can reference other questions.
 */
export function validateElementValue(
  element: QuestionDefinition,
  value: FieldValue,
  allValues: Readonly<Record<string, FieldValue>>,
): ValidationResult {
  const failures: ValidationFailure[] = [];
  const rules: ValidationRule[] = [...(element.validations ?? [])];

  if (element.required) {
    const hasRequired = rules.some((r) => r.rule === 'required');
    if (!hasRequired)
      rules.unshift({ id: '__required__', rule: 'required', message: 'This field is required' });
  }

  if (has(element, 'options') && !isEmpty(value)) {
    const allowed = element.options.map((o) => o.value);
    if (Array.isArray(value) !== (element.type === 'multiChoice')) {
      failures.push({ ruleId: '__option__', type: 'custom', message: 'Select valid option count' });
    }
    const picked = Array.isArray(value) ? value : [value];
    if (
      picked.some(
        // Reject options with value not string or number
        (v) =>
          !allowed.some(
            (a) =>
              (typeof v === 'string' || typeof v === 'number') &&
              (a === v || String(a) === String(v)),
          ),
      )
    ) {
      failures.push({ ruleId: '__option__', type: 'custom', message: 'Select a valid option' });
    }
  }

  for (const rule of rules) {
    const failure = checkRule(element, rule, value, allValues);
    if (failure !== null) failures.push({ ruleId: rule.id, type: rule.rule, message: failure });
  }

  return { valid: failures.length === 0, failures };
}

function checkRule(
  element: QuestionDefinition,
  rule: ValidationRule,
  value: FieldValue,
  allValues: Readonly<Record<string, FieldValue>>,
): string | null {
  // Not required and empty
  if (rule.rule !== 'required' && isEmpty(value)) return null;

  switch (rule.rule) {
    case 'required':
      return isEmpty(value) ? errorMessage(rule, element.label) : null;
    case 'minLength':
    case 'minCount': {
      const min = num(rule.value, 0);
      const len = lengthOf(value);
      return len !== null && len < min ? errorMessage(rule, `${min}`) : null;
    }
    case 'maxLength':
    case 'maxCount': {
      const max = num(rule.value, Infinity);
      const len = lengthOf(value);
      return len !== null && len > max ? errorMessage(rule, `${max}`) : null;
    }
    case 'min': {
      const n = number(value);
      const min = num(rule.value, -Infinity);
      return n !== null && n < min ? errorMessage(rule, `${min}`) : null;
    }
    case 'max': {
      const n = number(value);
      const max = num(rule.value, Infinity);
      return n !== null && n > max ? errorMessage(rule, `${max}`) : null;
    }
    case 'between': {
      const n = number(value);
      const lo = num(rule.value, -Infinity);
      const hi = num(rule.valueTo, Infinity);
      return n !== null && (n < lo || n > hi) ? errorMessage(rule, `${lo}-${hi}`) : null;
    }
    case 'pattern': {
      if (typeof value !== 'string' || value === '') return null;
      let re: Matcher;
      try {
        re = compileRegex(rule.pattern ?? '');
      } catch {
        return null;
      }
      return re.test(value) ? null : errorMessage(rule, rule.pattern);
    }
    case 'email':
      return stringValue(value) && !compileRegex(EMAIL_RE, 'i').test(String(value))
        ? errorMessage(rule)
        : null;
    case 'url':
      return stringValue(value) && !compileRegex(URL_RE, 'i').test(String(value))
        ? errorMessage(rule)
        : null;
    case 'phone':
      return stringValue(value) && !compileRegex(PHONE_RE).test(String(value))
        ? errorMessage(rule)
        : null;
    case 'integer':
      return number(value) !== null && !Number.isInteger(number(value)) ? errorMessage(rule) : null;
    case 'number':
      return number(value) === null && stringValue(value) ? errorMessage(rule) : null;
    // Compared by calendar day, so the bound day itself passes for date and
    // dateTime values alike and the result does not depend on the time zone.
    case 'dateMin': {
      const day = dayOf(value);
      const limit = dayOf(rule.value);
      return day && limit && day < limit ? errorMessage(rule, limit) : null;
    }
    case 'dateMax': {
      const day = dayOf(value);
      const limit = dayOf(rule.value);
      return day && limit && day > limit ? errorMessage(rule, limit) : null;
    }
    case 'minFiles': {
      const files = fileList(value);
      const min = num(rule.value, 0);
      return files !== null && files.length < min ? errorMessage(rule, `${min}`) : null;
    }
    case 'maxFiles': {
      const files = fileList(value);
      const max = num(rule.value, Infinity);
      return files !== null && files.length > max ? errorMessage(rule, `${max}`) : null;
    }
    case 'fileSizeMaxMb': {
      const files = fileList(value);
      const limitMb = num(rule.value, Infinity);
      if (!files) return null;
      const oversize = files.some((f) => 'size' in f && f.size > limitMb * 1024 * 1024);
      return oversize ? errorMessage(rule, `${limitMb}`) : null;
    }
    case 'fileType': {
      const files = fileList(value);
      if (!files) return null;
      const accepted = (rule.accept ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (accepted.length === 0) return null;
      const wrong = files.some(
        (f) =>
          'name' in f &&
          !accepted.some((a) => a === f.mimeType || f.name.toLowerCase().endsWith(a)),
      );
      return wrong ? errorMessage(rule, accepted.join(', ')) : null;
    }
    case 'custom': {
      if (!rule.expression) return null;
      const result = evalExpression(rule.expression, allValues as never);
      if (typeof result === 'string') return result === '' ? null : result;
      return result === true || result === null ? null : errorMessage(rule, '');
    }
    default:
      return null;
  }
}

function errorMessage(rule: ValidationRule, detail = ''): string {
  return rule.message.replaceAll('{detail}', detail);
}

function isEmpty(value: FieldValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function lengthOf(value: FieldValue): number | null {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.length;
  return null;
}

function number(value: FieldValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function stringValue(value: FieldValue): boolean {
  return value !== null && value !== undefined && String(value) !== '';
}

/** The `YYYY-MM-DD` day of a date or `datetime-local` string, or null if it has none. */
function dayOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const day = /^\d{4}-\d{2}-\d{2}/.exec(value.trim())?.[0];
  return day && !Number.isNaN(Date.parse(day)) ? day : null;
}

function fileList(value: FieldValue): Extract<FieldValue, object[]> | null {
  if (Array.isArray(value) && value.length === 0) return [];
  if (Array.isArray(value) && typeof value[0] === 'object' && 'name' in value[0]) {
    return value as Extract<FieldValue, object[]>;
  }
  return null;
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Compiled through `compileRegex` so the server runs them on RE2 as well.
const EMAIL_RE = String.raw`^[^\s@]+@[^\s@]+\.[^\s@]+$`;
const URL_RE = String.raw`^(https?://)?([\w-]+\.)+[\w-]{2,}(/\S*)?$`;
const PHONE_RE = String.raw`^[+()\-\s\d]{7,20}$`;
