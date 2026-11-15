import { ComponentFixture, TestBed } from '@angular/core/testing';
import { createElement } from '@shared/model/form-factory';
import { type FormDefinition } from '@shared/model';
import { ExpressionEditor } from './expression-editor';

describe('ExpressionEditor', () => {
  let component: ExpressionEditor;
  let fixture: ComponentFixture<ExpressionEditor>;
  let host: HTMLElement;
  const emitted: string[] = [];

  const name = { ...createElement('text', 'Name'), id: 'q1' };
  const age = { ...createElement('number', 'Age <b>'), id: 'q2' };
  const form = { elements: { q1: name, q2: age } } as unknown as FormDefinition;

  function type(text: string): void {
    const node = host.lastChild?.nodeType === Node.TEXT_NODE ? host.lastChild : null;
    const textNode = node ?? host.appendChild(document.createTextNode(''));
    textNode.textContent += text;
    const range = document.createRange();
    range.setStart(textNode, textNode.textContent?.length ?? 0);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    host.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    emitted.length = 0;
    await TestBed.configureTestingModule({ imports: [ExpressionEditor] }).compileComponents();
    fixture = TestBed.createComponent(ExpressionEditor);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('form', form);
    component.valueChange.subscribe((v) => emitted.push(v));
    await fixture.whenStable();
    host = fixture.nativeElement.querySelector('.textInput');
  });

  it('renders known variables as chips and keeps other text verbatim', async () => {
    fixture.componentRef.setInput('value', 'a < {{q1}} && {{x}}');
    await fixture.whenStable();
    expect(host.querySelectorAll('.var')).toHaveLength(1);
    expect(host.querySelector('.var')?.textContent).toBe('Name');
    expect(host.textContent).toBe('a < Name && {{x}}');
  });

  it('turns a typed variable into a chip and keeps existing chips', async () => {
    fixture.componentRef.setInput('value', '{{q2}} + ');
    await fixture.whenStable();
    type('{{q1}}');
    expect(emitted.at(-1)).toBe('{{q2}} + {{q1}}');
    expect(host.querySelectorAll('.var')).toHaveLength(2);
    expect(host.querySelector('.var')?.textContent).toBe('Age <b>');
  });

  it('suggests questions after {{ and inserts the picked one', () => {
    type('1 + {{ag');
    const options = fixture.nativeElement.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(1);
    options[0].dispatchEvent(new MouseEvent('mousedown'));
    fixture.detectChanges();
    expect(emitted.at(-1)).toBe('1 + {{q2}}');
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
  });
});
