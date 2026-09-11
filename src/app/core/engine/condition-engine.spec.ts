import { describe, expect, it } from 'vitest';
import { evalCondition, evalConditionGroup, conditionGroupReferences } from './condition-engine';
import type { Condition, ConditionGroup } from '../../shared/model/conditions.model';
import type { FieldValue } from '../../shared/model/values.model';

const values: Record<string, FieldValue> = {
  name: 'Alice',
  age: 30,
  score: 8.5,
  colors: ['red', 'blue'],
  empty: '',
  missing: null,
};

describe('evalCondition', () => {
  it('eq / neq', () => {
    expect(
      evalCondition(
        { fieldId: 'name', operator: 'eq', operand: { kind: 'literal', value: 'Alice' } },
        values,
      ),
    ).toBe(true);
    expect(
      evalCondition(
        { fieldId: 'name', operator: 'neq', operand: { kind: 'literal', value: 'Bob' } },
        values,
      ),
    ).toBe(true);
    expect(
      evalCondition(
        { fieldId: 'name', operator: 'eq', operand: { kind: 'literal', value: 'Bob' } },
        values,
      ),
    ).toBe(false);
  });

  it('numeric comparisons', () => {
    expect(
      evalCondition(
        { fieldId: 'age', operator: 'gt', operand: { kind: 'literal', value: 25 } },
        values,
      ),
    ).toBe(true);
    expect(
      evalCondition(
        { fieldId: 'age', operator: 'lte', operand: { kind: 'literal', value: 30 } },
        values,
      ),
    ).toBe(true);
    expect(
      evalCondition(
        { fieldId: 'age', operator: 'lt', operand: { kind: 'literal', value: 30 } },
        values,
      ),
    ).toBe(false);
  });

  it('isEmpty / isNotEmpty', () => {
    expect(evalCondition({ fieldId: 'empty', operator: 'isEmpty' }, values)).toBe(true);
    expect(evalCondition({ fieldId: 'name', operator: 'isEmpty' }, values)).toBe(false);
    expect(evalCondition({ fieldId: 'missing', operator: 'isEmpty' }, values)).toBe(true);
    expect(evalCondition({ fieldId: 'name', operator: 'isNotEmpty' }, values)).toBe(true);
  });

  it('contains', () => {
    expect(
      evalCondition(
        { fieldId: 'name', operator: 'contains', operand: { kind: 'literal', value: 'lic' } },
        values,
      ),
    ).toBe(true);
    expect(
      evalCondition(
        { fieldId: 'colors', operator: 'contains', operand: { kind: 'literal', value: 'blue' } },
        values,
      ),
    ).toBe(true);
  });

  it('startsWith / endsWith', () => {
    expect(
      evalCondition(
        { fieldId: 'name', operator: 'startsWith', operand: { kind: 'literal', value: 'Ali' } },
        values,
      ),
    ).toBe(true);
    expect(
      evalCondition(
        { fieldId: 'name', operator: 'endsWith', operand: { kind: 'literal', value: 'ce' } },
        values,
      ),
    ).toBe(true);
  });

  it('in / notIn', () => {
    const cond: Condition = { fieldId: 'age', operator: 'in', values: [20, 30, 40] };
    expect(evalCondition(cond, values)).toBe(true);
    expect(evalCondition({ ...cond, operator: 'notIn' }, values)).toBe(false);
  });

  it('hasAnyOf / hasAllOf', () => {
    expect(
      evalCondition({ fieldId: 'colors', operator: 'hasAnyOf', values: ['red', 'green'] }, values),
    ).toBe(true);
    expect(
      evalCondition(
        { fieldId: 'colors', operator: 'hasAllOf', values: ['red', 'blue', 'green'] },
        values,
      ),
    ).toBe(false);
  });

  it('between', () => {
    const cond: Condition = {
      fieldId: 'score',
      operator: 'between',
      operand: { kind: 'literal', value: 8 },
      operandTo: { kind: 'literal', value: 9 },
    };
    expect(evalCondition(cond, values)).toBe(true);
  });

  it('field operand', () => {
    const cond: Condition = {
      fieldId: 'age',
      operator: 'eq',
      operand: { kind: 'field', fieldId: 'score' },
    };
    expect(evalCondition(cond, { age: 5, score: 5 })).toBe(true);
    expect(evalCondition(cond, values)).toBe(false);
  });

  it('unset fieldId is treated as truthy', () => {
    expect(evalCondition({ fieldId: '', operator: 'eq' }, values)).toBe(true);
  });
});

describe('evalConditionGroup', () => {
  const group: ConditionGroup = {
    logic: 'all',
    conditions: [
      { fieldId: 'age', operator: 'gt', operand: { kind: 'literal', value: 25 } },
      { fieldId: 'name', operator: 'startsWith', operand: { kind: 'literal', value: 'A' } },
    ],
    groups: [],
  };

  it('evaluates all logic', () => {
    expect(evalConditionGroup(group, values)).toBe(true);
    expect(
      evalConditionGroup(
        {
          ...group,
          conditions: [
            group.conditions[0],
            { fieldId: 'name', operator: 'eq', operand: { kind: 'literal', value: 'Bob' } },
          ],
        },
        values,
      ),
    ).toBe(false);
  });

  it('evaluates any logic', () => {
    const anyGroup: ConditionGroup = { logic: 'any', conditions: group.conditions, groups: [] };
    expect(evalConditionGroup(anyGroup, values)).toBe(true);
  });

  it('evaluates nested groups', () => {
    const nested: ConditionGroup = {
      logic: 'all',
      conditions: [],
      groups: [
        group,
        {
          logic: 'any',
          conditions: [
            { fieldId: 'score', operator: 'gt', operand: { kind: 'literal', value: 9 } },
          ],
          groups: [],
        },
      ],
    };
    expect(evalConditionGroup(nested, values)).toBe(false);
  });

  it('empty group returns true', () => {
    expect(evalConditionGroup({ logic: 'all', conditions: [], groups: [] }, values)).toBe(true);
    expect(evalConditionGroup(null, values)).toBe(true);
  });
});

describe('conditionGroupReferences', () => {
  it('collects field ids from both sides of conditions', () => {
    const refs = conditionGroupReferences({
      logic: 'all',
      conditions: [
        { fieldId: 'a', operator: 'eq', operand: { kind: 'field', fieldId: 'b' } },
        { fieldId: 'c', operator: 'in', values: [1, 2] },
      ],
      groups: [{ logic: 'any', conditions: [{ fieldId: 'd', operator: 'isEmpty' }], groups: [] }],
    });
    expect(refs.sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
