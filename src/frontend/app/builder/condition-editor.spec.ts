import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { dict } from '@shared/helper';
import type { FormDocument } from '@shared/model';
import type { ConditionGroup } from '@shared/model/conditions.model';
import type { ElementDefinition } from '@shared/model/form.model';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nService } from '../core/i18n';
import { ConditionEditor } from './condition-editor';

describe('ConditionEditor', () => {
  let fixture: ComponentFixture<ConditionEditor>;
  let changed: ConditionGroup[];

  /** Shows one `in` condition on a question of `type`. */
  function show(type: string): void {
    const elements = dict<ElementDefinition>();
    elements['q'] = { id: 'q', type, label: 'Q' } as ElementDefinition;
    const form = { pages: [], elements } as unknown as FormDocument;
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('self', 'other');
    fixture.componentRef.setInput('group', {
      logic: 'all',
      conditions: [{ fieldId: 'q', operator: 'in', operand: { kind: 'literal', value: [] } }],
      groups: [],
    } satisfies ConditionGroup);
    fixture.detectChanges();
  }

  const listValue = () => {
    const operand = changed.at(-1)?.conditions[0].operand;
    return operand?.kind === 'literal' ? operand.value : undefined;
  };

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
