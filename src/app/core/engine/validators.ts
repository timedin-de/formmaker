import type { ElementDefinition } from '../model/form.model';
import type { ValidationRule, ValidationRuleType } from '../model/validation.model';
import { evalExpression } from './expression/evaluator';
import { interpolateTemplate } from './expression/template';
import type { FieldValue } from '../model/values.model';

export interface ValidationFailure {
  ruleId: string;
  type: ValidationRuleType;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  failures: ValidationFailure[];
}

/**
 * Validates a field value against the element's rules.
 * `allValues` carries the current form answers so custom expressions and
 * piped messages can reference other questions.
 */
export function validateElementValue(
  element: ElementDefinition,
  value: FieldValue,
  allValues: Readonly<Record<string, FieldValue>>,
): ValidationResult {
  const failures: ValidationFailure[] = [];
  const rules: ValidationRule[] = [...(element.validations ?? [])];

  if (element.required) {
    const hasRequired = rules.some((r) => r.rule === 'required');
    if (!hasRequired) rules.unshift({ id: '__required__', rule: 'required' });
  }

  for (const rule of rules) {
    const message = rule.message ? interpolateTemplate(rule.message, allValues) : undefined;
    const failure = checkRule(element, rule, value, allValues);
    if (failure) failures.push({ ruleId: rule.id, type: rule.rule, message: message ?? failure });
  }

  return { valid: failures.length === 0, failures };
}

function checkRule(
  element: ElementDefinition,
  rule: ValidationRule,
  value: FieldValue,
  allValues: Readonly<Record<string, FieldValue>>,
): string | null {
  switch (rule.rule) {
    case 'required':
      return isEmpty(value) ? defaultMessage('required', element.label) : null;
    case 'minLength': {
      const min = num(rule.value, 0);
      const len = lengthOf(value);
      return len !== null && len < min ? defaultMessage('minLength', `${min}`) : null;
    }
    case 'maxLength': {
      const max = num(rule.value, Infinity);
      const len = lengthOf(value);
      return len !== null && len > max ? defaultMessage('maxLength', `${max}`) : null;
    }
    case 'min': {
      const n = number(value);
      const min = num(rule.value, -Infinity);
      return n !== null && n < min ? defaultMessage('min', `${min}`) : null;
    }
    case 'max': {
      const n = number(value);
      const max = num(rule.value, Infinity);
      return n !== null && n > max ? defaultMessage('max', `${max}`) : null;
    }
    case 'between': {
      const n = number(value);
      const lo = num(rule.value, -Infinity);
      const hi = num(rule.valueTo, Infinity);
      return n !== null && (n < lo || n > hi) ? defaultMessage('between', `${lo}-${hi}`) : null;
    }
    case 'pattern': {
      if (typeof value !== 'string' || value === '') return null;
      let re: RegExp;
      try {
        re = new RegExp(rule.pattern ?? '', '');
      } catch {
        return null;
      }
      return re.test(value) ? null : defaultMessage('pattern', rule.pattern ?? '');
    }
    case 'email':
      return stringValue(value) && !EMAIL_RE.test(String(value))
        ? defaultMessage('email', '')
        : null;
    case 'url':
      return stringValue(value) && !URL_RE.test(String(value)) ? defaultMessage('url', '') : null;
    case 'phone':
      return stringValue(value) && !PHONE_RE.test(String(value))
        ? defaultMessage('phone', '')
        : null;
    case 'integer':
      return number(value) !== null && !Number.isInteger(number(value))
        ? defaultMessage('integer', '')
        : null;
    case 'number':
      return number(value) === null && stringValue(value) ? defaultMessage('number', '') : null;
    case 'dateMin': {
      const dv = dateValue(value);
      const limit = typeof rule.value === 'string' ? new Date(rule.value) : null;
      return dv && limit && dv < limit ? defaultMessage('dateMin', formatDate(limit)) : null;
    }
    case 'dateMax': {
      const dv = dateValue(value);
      const limit = typeof rule.value === 'string' ? new Date(rule.value) : null;
      return dv && limit && dv > limit ? defaultMessage('dateMax', formatDate(limit)) : null;
    }
    case 'minFiles': {
      const files = fileList(value);
      const min = num(rule.value, 0);
      return files !== null && files.length < min ? defaultMessage('minFiles', `${min}`) : null;
    }
    case 'maxFiles': {
      const files = fileList(value);
      const max = num(rule.value, Infinity);
      return files !== null && files.length > max ? defaultMessage('maxFiles', `${max}`) : null;
    }
    case 'fileSizeMaxMb': {
      const files = fileList(value);
      const limitMb = num(rule.value, Infinity);
      if (!files) return null;
      const oversize = files.some((f) => 'size' in f && f.size > limitMb * 1024 * 1024);
      return oversize ? defaultMessage('fileSizeMaxMb', `${limitMb}`) : null;
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
      return wrong ? defaultMessage('fileType', accepted.join(', ')) : null;
    }
    case 'custom': {
      if (!rule.expression) return null;
      const result = evalExpression(rule.expression, allValues as never);
      if (typeof result === 'string') return result === '' ? null : result;
      return result === true || result === null ? null : defaultMessage('custom', '');
    }
    default:
      return null;
  }
}

function defaultMessage(type: ValidationRuleType, detail = ''): string {
  const base: Record<string, string> = {
    required: 'This field is required',
    minLength: `Must be at least ${detail} characters`,
    maxLength: `Must be at most ${detail} characters`,
    min: `Must be at least ${detail}`,
    max: `Must be at most ${detail}`,
    between: `Must be between ${detail}`,
    pattern: `Does not match the required format (${detail})`,
    email: 'Enter a valid email address',
    url: 'Enter a valid URL',
    phone: 'Enter a valid phone number',
    integer: 'Enter a whole number',
    number: 'Enter a number',
    dateMin: `Must be after ${detail}`,
    dateMax: `Must be before ${detail}`,
    minFiles: `Select at least ${detail} file(s)`,
    maxFiles: `Select at most ${detail} file(s)`,
    fileSizeMaxMb: `Files must be at most ${detail} MB`,
    fileType: `Unsupported file type. Allowed: ${detail}`,
    custom: 'This value is invalid',
  };
  return base[type] ?? 'Invalid value';
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

function dateValue(value: FieldValue): Date | null {
  if (!stringValue(value)) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function fileList(value: FieldValue): Extract<FieldValue, object[]> | null {
  if (Array.isArray(value) && value.length === 0) return [];
  if (Array.isArray(value) && typeof value[0] === 'object' && 'name' in value[0]) {
    return value as unknown as Extract<FieldValue, object[]>;
  }
  return null;
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i;
const PHONE_RE = /^[+()\-\s\d]{7,20}$/;
