import { describe, expect, it } from 'vitest';
import { evalExpression, type EvalContext } from './expression/evaluator';
import { parse } from './expression/parser';
import { collectReferences } from './expression/parser';

describe('ExpressionParser', () => {
  it('parses number literals', () => {
    const e = parse('42');
    expect(e).toEqual({ type: 'literal', value: 42 });
  });

  it('parses string literals', () => {
    const e = parse("'hello world'");
    expect(e).toEqual({ type: 'literal', value: 'hello world' });
  });

  it('parses boolean literals', () => {
    expect(parse('true')).toEqual({ type: 'literal', value: true });
    expect(parse('false')).toEqual({ type: 'literal', value: false });
    expect(parse('null')).toEqual({ type: 'literal', value: null });
  });

  it('parses identifiers', () => {
    const e = parse('field_a');
    expect(e).toEqual({ type: 'identifier', name: 'field_a' });
  });

  it('parses binary arithmetic', () => {
    const e = parse('1 + 2 * 3');
    expect(e).toEqual({
      type: 'binary',
      op: '+',
      left: { type: 'literal', value: 1 },
      right: {
        type: 'binary',
        op: '*',
        left: { type: 'literal', value: 2 },
        right: { type: 'literal', value: 3 },
      },
    });
  });

  it('parses parenthesized expression', () => {
    const e = parse('(1 + 2) * 3');
    expect(e).toEqual({
      type: 'binary',
      op: '*',
      left: {
        type: 'binary',
        op: '+',
        left: { type: 'literal', value: 1 },
        right: { type: 'literal', value: 2 },
      },
      right: { type: 'literal', value: 3 },
    });
  });

  it('parses function call', () => {
    const e = parse('sum(a, b)');
    expect(e).toEqual({
      type: 'call',
      name: 'sum',
      args: [
        { type: 'identifier', name: 'a' },
        { type: 'identifier', name: 'b' },
      ],
    });
  });

  it('parses unary negation', () => {
    const e = parse('-x');
    expect(e).toEqual({ type: 'unary', op: '-', operand: { type: 'identifier', name: 'x' } });
  });

  it('collects references', () => {
    const refs = collectReferences(parse('(a + b) * c'));
    expect([...refs].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('ExpressionEvaluator', () => {
  it('evaluates arithmetic', () => {
    expect(evalExpression('2 + 3 * 4', {})).toBe(14);
    expect(evalExpression('(2 + 3) * 4', {})).toBe(20);
    expect(evalExpression('10 / 3', {})).toBeCloseTo(3.333, 2);
    expect(evalExpression('10 % 3', {})).toBe(1);
    expect(evalExpression('2 ^ 3', {})).toBe(8);
  });

  it('evaluates unary', () => {
    expect(evalExpression('-5', {})).toBe(-5);
    expect(evalExpression('!true', {})).toBe(false);
  });

  it('evaluates comparisons', () => {
    expect(evalExpression('1 < 2', {})).toBe(true);
    expect(evalExpression('2 >= 2', {})).toBe(true);
    expect(evalExpression('3 == 3', {})).toBe(true);
    expect(evalExpression('3 != 3', {})).toBe(false);
    expect(evalExpression('3 ~= 3', {})).toBe(true);
    expect(evalExpression("'abc' ~= 'ABC'", {})).toBe(true);
  });

  it('evaluates logical', () => {
    expect(evalExpression('true && false', {})).toBe(false);
    expect(evalExpression('true || false', {})).toBe(true);
    expect(evalExpression('!false', {})).toBe(true);
  });

  it('evaluates string concatenation with +', () => {
    expect(evalExpression("'hello' + ' ' + 'world'", {})).toBe('hello world');
    expect(evalExpression("'count: ' + 5", {})).toBe('count: 5');
  });

  it('evaluates identifiers against context', () => {
    const ctx: EvalContext = { a: 10, b: 20 };
    expect(evalExpression('a + b', ctx)).toBe(30);
  });

  it('treats unknown identifiers as null', () => {
    expect(evalExpression('a + b', { a: 5 })).toBeNull();
  });

  it('evaluates functions', () => {
    const ctx: EvalContext = { a: 3, b: 7 };
    expect(evalExpression('sum(a, b)', ctx)).toBe(10);
    expect(evalExpression('max(a, b)', ctx)).toBe(7);
    expect(evalExpression('min(a, b)', ctx)).toBe(3);
    expect(evalExpression('count(a, b, null)', ctx)).toBe(2);
    expect(evalExpression('if(b > 5, "big", "small")', ctx)).toBe('big');
    expect(evalExpression('concat("Hello, ", b)', ctx)).toBe('Hello, 7');
    expect(evalExpression('lower("ABC")', {})).toBe('abc');
    expect(evalExpression('upper("abc")', {})).toBe('ABC');
    expect(evalExpression('length("test")', {})).toBe(4);
    expect(evalExpression('abs(-5)', {})).toBe(5);
    expect(evalExpression('round(3.456, 2)', {})).toBeCloseTo(3.46, 4);
    expect(evalExpression('round(3.456)', {})).toBe(3);
    expect(evalExpression('floor(3.7)', {})).toBe(3);
    expect(evalExpression('ceil(3.2)', {})).toBe(4);
  });

  it('evaluates coalesce', () => {
    expect(evalExpression('coalesce(null, 2, 3)', {})).toBe(2);
    expect(evalExpression('coalesce(null, null)', {})).toBeNull();
  });

  it('returns null on division by zero', () => {
    expect(evalExpression('10 / 0', {})).toBeNull();
  });

  it('evaluates nested expression', () => {
    const ctx: EvalContext = { x: 2, y: 3 };
    expect(evalExpression('(x + y) * (x - 1)', ctx)).toBe(5);
  });
});
