import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nService } from '../../i18n';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  let fixture: ComponentFixture<ConfirmDialog>;
  let closed: ReturnType<typeof vi.fn<(ok: boolean) => void>>;

  async function create(confirmWord?: string): Promise<HTMLElement> {
    await TestBed.configureTestingModule({ providers: [I18nService] }).compileComponents();
    fixture = TestBed.createComponent(ConfirmDialog);
    fixture.componentRef.setInput('title', 'Delete it?');
    fixture.componentRef.setInput('message', 'It is gone for good.');
    fixture.componentRef.setInput('confirmLabel', 'Delete');
    if (confirmWord) fixture.componentRef.setInput('confirmWord', confirmWord);
    closed = vi.fn<(ok: boolean) => void>();
    fixture.componentInstance.closed.subscribe(closed);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function buttons(root: HTMLElement): { cancel: HTMLButtonElement; confirm: HTMLButtonElement } {
    const [cancel, confirm] = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    return { cancel, confirm };
  }

  beforeEach(() => TestBed.resetTestingModule());

  it('labels the dialog with its title and message', async () => {
    const root = await create();
    const dialog = root.querySelector('dialog')!;
    const title = root.querySelector(`#${dialog.getAttribute('aria-labelledby')}`);
    const text = root.querySelector(`#${dialog.getAttribute('aria-describedby')}`);
    expect(title?.textContent).toBe('Delete it?');
    expect(text?.textContent).toBe('It is gone for good.');
  });

  it('gives Cancel the initial focus, not the destructive button', async () => {
    const { cancel, confirm } = buttons(await create());
    expect(cancel.hasAttribute('autofocus')).toBe(true);
    expect(confirm.hasAttribute('autofocus')).toBe(false);
  });

  it('emits false on cancel and true on confirm, once', async () => {
    let root = await create();
    buttons(root).cancel.click();
    buttons(root).confirm.click();
    expect(closed.mock.calls).toEqual([[false]]);

    TestBed.resetTestingModule();
    root = await create();
    buttons(root).confirm.click();
    expect(closed.mock.calls).toEqual([[true]]);
  });

  it('cancels on Escape', async () => {
    const root = await create();
    const cancel = new Event('cancel', { cancelable: true });
    root.querySelector('dialog')!.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(closed).toHaveBeenCalledWith(false);
  });

  it('only confirms once the confirm word is typed', async () => {
    const root = await create('DELETE');
    const { confirm } = buttons(root);
    const input = root.querySelector('input')!;
    expect(confirm.disabled).toBe(true);

    input.value = 'delet';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(confirm.disabled).toBe(true);
    expect(closed).not.toHaveBeenCalled();

    input.value = ' delete ';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(confirm.disabled).toBe(false);
    confirm.click();
    expect(closed).toHaveBeenCalledWith(true);
  });

  it('clears the typed word when it asks about something else', async () => {
    const root = await create('DELETE');
    const input = root.querySelector('input')!;
    input.value = 'delete';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(buttons(root).confirm.disabled).toBe(false);

    fixture.componentRef.setInput('message', 'Something else is gone for good.');
    await fixture.whenStable();
    expect(root.querySelector('input')!.value).toBe('');
    expect(buttons(root).confirm.disabled).toBe(true);
  });
});
