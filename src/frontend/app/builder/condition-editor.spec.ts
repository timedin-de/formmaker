import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { dict } from '@shared/helper';
import type { FormDocument } from '@shared/model';
import type { Condition, ConditionGroup } from '@shared/model/conditions.model';
import type { ElementDefinition } from '@shared/model/form.model';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nService } from '../core/i18n';
import { ConditionEditor } from './condition-editor';

describe('ConditionEditor', () => {
  let fixture: ComponentFixture<ConditionEditor>;
  let changed: ConditionGroup[];

  /** Shows one condition on a question of `type` (`in` with an empty list by default). */
  function show(type: string, condition?: Partial<Condition>): void {
    const elements = dict<ElementDefinition>();
    elements['q'] = { id: 'q', type, label: 'Q' } as ElementDefinition;
    elements['c'] = {
      id: 'c',
      type: 'choice',
      label: 'C',
      options: [{ id: 'opt-a', label: 'A' }],
    } as ElementDefinition;
    const form = { pages: [], elements } as unknown as FormDocument;
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('self', 'other');
    fixture.componentRef.setInput('group', {
      logic: 'all',
      conditions: [
        {
          fieldId: 'q',
          operator: 'in',
          operand: { kind: 'literal', value: [] },
          ...condition,
        },
      ],
      groups: [],
    } satisfies ConditionGroup);
    fixture.detectChanges();
  }

  const lastCondition = () => changed.at(-1)?.conditions[0];
  const listValue = () => {
    const operand = lastCondition()?.operand;
    return operand?.kind === 'literal' ? operand.value : undefined;
  };

  it('reports no change just by rendering, but when the author picks the logic', async () => {
    show('text');
    await fixture.whenStable();
    expect(changed).toEqual([]);

    const any = fixture.nativeElement.querySelectorAll('mat-button-toggle button')[1];
    (any as HTMLButtonElement).click();
    expect(changed.map((g) => g.logic)).toEqual(['any']);
  });

  describe('picking another tested question', () => {
    it('clears the value instead of converting it', () => {
      show('choice', {
        fieldId: 'c',
        operator: 'eq',
        operand: { kind: 'literal', value: 'opt-a' },
      });
      fixture.componentInstance.setField(0, 'q', 'text');
      expect(lastCondition()).toEqual({
        fieldId: 'q',
        fieldType: 'text',
        operator: 'eq',
        operand: { kind: 'literal', value: null },
      });
    });

    it('clears both bounds and a compared question', () => {
      show('number', {
        operator: 'between',
        operand: { kind: 'literal', value: 1 },
        operandTo: { kind: 'literal', value: 5 },
      });
      fixture.componentInstance.setField(0, 'd', 'date');
      expect(lastCondition()).toEqual({
        fieldId: 'd',
        fieldType: 'date',
        operator: 'between',
        operand: { kind: 'literal', value: null },
      });

      show('text', { operator: 'eq', operand: { kind: 'field', fieldId: 'c' } });
      fixture.componentInstance.setField(0, 'n', 'number');
      expect(lastCondition()?.operand).toEqual({ kind: 'literal', value: null });
    });

    it('keeps the value for a question of the same type', () => {
      show('number', {
        operator: 'between',
        operand: { kind: 'literal', value: 1 },
        operandTo: { kind: 'literal', value: 5 },
      });
      fixture.componentInstance.setField(0, 'n', 'number');
      expect(lastCondition()).toEqual({
        fieldId: 'n',
        fieldType: 'number',
        operator: 'between',
        operand: { kind: 'literal', value: 1 },
        operandTo: { kind: 'literal', value: 5 },
      });
    });

    it('clears option ids even for another question of the same choice type', () => {
      show('choice', {
        fieldId: 'c',
        operator: 'eq',
        operand: { kind: 'literal', value: 'opt-a' },
      });
      fixture.componentInstance.setField(0, 'c2', 'choice');
      expect(lastCondition()?.operand).toEqual({ kind: 'literal', value: null });
    });

    it('keeps an empty list for list operators, and falls back to eq where they do not fit', () => {
      show('text', { operator: 'in', operand: { kind: 'literal', value: ['a'] } });
      fixture.componentInstance.setField(0, 'c', 'choice');
      expect(lastCondition()?.operator).toBe('in');
      expect(listValue()).toEqual([]);

      show('number', {
        operator: 'between',
        operand: { kind: 'literal', value: 1 },
        operandTo: { kind: 'literal', value: 5 },
      });
      fixture.componentInstance.setField(0, 'c', 'choice');
      expect(lastCondition()).toEqual({
        fieldId: 'c',
        fieldType: 'choice',
        operator: 'eq',
        operand: { kind: 'literal', value: null },
      });
    });

    it('keeps the value when the same question is picked again', () => {
      show('text', { operator: 'eq', operand: { kind: 'literal', value: 'x' } });
      fixture.componentInstance.setField(0, 'q', 'text');
      expect(changed).toEqual([]);
    });
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConditionEditor],
      providers: [I18nService],
    }).compileComponents();
    fixture = TestBed.createComponent(ConditionEditor);
    changed = [];
    fixture.componentInstance.changed.subscribe((g) => changed.push(g));
  });

  it('keeps list entries of a text question as text', () => {
    show('text');
    fixture.componentInstance.setList(0, '001, 002, true');
    expect(listValue()).toEqual(['001', '002', 'true']);
  });

  it('parses list entries of a number question as numbers', () => {
    show('number');
    fixture.componentInstance.setList(0, '1, 2.5, , x');
    expect(listValue()).toEqual([1, 2.5, 'x']);
  });
});
