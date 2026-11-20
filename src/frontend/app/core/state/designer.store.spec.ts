import { TestBed } from '@angular/core/testing';
import { createElement, createPage } from '@shared/model/form-factory';
import type { ElementPatch, FormPatch, PagePatch } from '@shared/model/form-ops';
import type {
  ChoiceElement,
  ChoiceOption,
  ElementDefinition,
  GroupElement,
  PageDefinition,
  TextElement,
} from '@shared/model/form.model';
import {
  type CreateElementRequest,
  type CreateOptionRequest,
  type CreateValidationRuleRequest,
  type UpdateOptionRequest,
  type UpdateValidationRuleRequest,
} from '@shared/schemas';
import { addToGroup, getElements, newForm } from '@test/helper';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod/mini';
import { I18nService } from '../i18n/translation.service';
import { ApiError } from './api-error';
import { DesignerStore, PATCH_DELAY_MS, RETRY_DELAYS_MS } from './designer.store';
import { FormsRepository } from './forms.repository';

function text(label: string): TextElement {
  return createElement('text', label) as TextElement;
}

/** How often a failing edit is sent in all, and how long that takes after the first. */
const ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const RETRIES_MS = RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0);

/** Makes `mock` reject with `error` the next `times` calls. */
function failTimes(
  mock: { mockRejectedValueOnce(error: unknown): unknown },
  times: number,
  error: unknown,
): void {
  for (let i = 0; i < times; i++) mock.mockRejectedValueOnce(error);
}

describe('DesignerStore stored form', () => {
  const create = () => {
    TestBed.configureTestingModule({
      providers: [DesignerStore, { provide: FormsRepository, useValue: {} }],
    });
    return TestBed.inject(DesignerStore);
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('restores the stored form without warning', () => {
    const form = newForm('Stored');
    localStorage.setItem('formmaker.designer.v1', JSON.stringify(form));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(create().form().name).toBe('Stored');
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when no form is stored', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(create()._form()).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns with the reason when the stored form is invalid', () => {
    localStorage.setItem('formmaker.designer.v1', '{"pages": "none"}');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(create()._form()).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('designer: stored form failed validation', expect.any(Error));
  });
});

describe('DesignerStore moveElementTo', () => {
  let store: DesignerStore;
  const repo = {
    moveElement: vi.fn(async () => undefined),
    deleteElement: vi.fn(async () => undefined),
    updateElement: vi.fn(async () => undefined),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [DesignerStore, { provide: FormsRepository, useValue: repo }],
    });
    store = TestBed.inject(DesignerStore);
  });

  /** group → [a, b], top-level: [c, group, d] */
  function scenario() {
    const form = newForm('Demo');

    const page = createPage('Page 1');
    const group = createElement('group', 'Group') as GroupElement;
    const a = text('A');
    const b = text('B');
    const c = text('C');
    const d = text('D');
    addToGroup([a, b], group, form);
    addToGroup([c, group, d], page, form);
    form.pages = [page];
    store.load(form);
    return { page, group, a, b, c, d };
  }

  const root = () => getElements(store.form().pages[0], store.form());

  const childrenOf = (id: string) => {
    const form = store.form();
    return (form.elements[id] as GroupElement).children.map((id) => form.elements[id]) ?? [];
  };
  const ids = (els: ElementDefinition[]) => els.map((e) => e.label);

  it('moves a top-level element into a group', async () => {
    const { group, c } = scenario();

    await store.moveElementTo(c.id, group.id, 1);

    expect(ids(root())).toEqual(['Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['A', 'C', 'B']);
  });

  it('moves a group child back out to the page root', async () => {
    const { page, group, a } = scenario();

    await store.moveElementTo(a.id, page.id, 0);

    expect(ids(root())).toEqual(['A', 'C', 'Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['B']);
  });

  it('moves an element between two groups', async () => {
    const { d } = scenario();
    const other = createElement('group', 'Other') as GroupElement;
    addToGroup(text('E'), other, store.form());
    const page = store.form().pages[0];
    addToGroup(other, page, store.form());

    await store.moveElementTo(d.id, other.id, 0);

    expect(ids(root())).toEqual(['C', 'Group', 'Other']);
    expect(ids(childrenOf(other.id))).toEqual(['D', 'E']);
  });

  it('reorders within the same container', async () => {
    const { group, a } = scenario();

    await store.moveElementTo(a.id, group.id, 1);

    expect(ids(childrenOf(group.id))).toEqual(['B', 'A']);
  });

  it('clamps an out-of-range index and sends the resulting position', async () => {
    const { group, a } = scenario();

    await store.moveElementTo(a.id, group.id, 99);

    expect(ids(childrenOf(group.id))).toEqual(['B', 'A']);
    expect(repo.moveElement).toHaveBeenCalledWith(store.form().id, a.id, {
      parentId: group.id,
      index: 1,
    });
  });

  it('refuses to move a group into its own descendant without sending it', async () => {
    const { group } = scenario();
    const inner = createElement('group', 'Inner') as GroupElement;
    addToGroup(text('F'), inner, store.form());
    addToGroup(inner, group, store.form());
    const innerId = childrenOf(group.id).at(-1)?.id as string;

    await store.moveElementTo(group.id, innerId, 0);

    expect(ids(root())).toEqual(['C', 'Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['A', 'B', 'Inner']);
    expect(ids(childrenOf(innerId))).toEqual(['F']);
    expect(repo.moveElement).not.toHaveBeenCalled();
  });

  it('sends the move to the server', async () => {
    const { group, c } = scenario();

    await store.moveElementTo(c.id, group.id, 0);

    expect(repo.moveElement).toHaveBeenCalledWith(store.form().id, c.id, {
      parentId: group.id,
      index: 0,
    });
    expect(ids(childrenOf(group.id))).toEqual(['C', 'A', 'B']);
  });

  it('applies the move before the server answers', async () => {
    const { group, c } = scenario();
    let release!: () => void;
    repo.moveElement.mockImplementationOnce(
      () => new Promise<undefined>((resolve) => (release = () => resolve(undefined))),
    );

    const move = store.moveElementTo(c.id, group.id, 0);

    expect(ids(childrenOf(group.id))).toEqual(['C', 'A', 'B']);
    await vi.waitFor(() => expect(release).toBeDefined());
    release();
    await move;
  });

  it('moves the element back when the server rejects the move', async () => {
    const { group, c } = scenario();
    repo.moveElement.mockRejectedValueOnce(new Error('offline'));

    await expect(store.moveElementTo(c.id, group.id, 0)).rejects.toThrow('offline');

    expect(ids(root())).toEqual(['C', 'Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['A', 'B']);
  });

  it('takes back a later move unsent when an earlier one fails', async () => {
    const { page, group, c, d } = scenario();
    let fail!: (error: Error) => void;
    repo.moveElement.mockImplementationOnce(
      () => new Promise<undefined>((_, reject) => (fail = reject)),
    );

    const first = store.moveElementTo(c.id, group.id, 0);
    const second = store.moveElementTo(d.id, page.id, 0);
    expect(ids(root())).toEqual(['D', 'Group']);
    await vi.waitFor(() => expect(fail).toBeDefined());
    fail(new Error('offline'));

    await expect(first).rejects.toThrow('offline');
    await second;
    expect(repo.moveElement).toHaveBeenCalledTimes(1);
    expect(ids(root())).toEqual(['C', 'Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['A', 'B']);
  });

  it('takes a failed move back behind the nearest former sibling still there', async () => {
    const { page, group, d } = scenario();
    repo.moveElement.mockRejectedValueOnce(new Error('offline'));

    // D followed the group, which is gone by the time the move fails.
    const removal = store.removeElement(group.id);
    const move = store.moveElementTo(d.id, page.id, 0);
    await removal;
    await expect(move).rejects.toThrow('offline');

    expect(ids(root())).toEqual(['C', 'D']);
  });

  it('sends a held edit of an element that a failed move took out of a removed group', async () => {
    const { group, c } = scenario();
    repo.moveElement.mockRejectedValueOnce(new Error('offline'));

    const move = store.moveElementTo(c.id, group.id, 0);
    store.updateElement(c.id, { label: 'Kept' });
    const removal = store.removeElement(group.id);
    await expect(move).rejects.toThrow('offline');
    await removal;

    expect(ids(root())).toEqual(['Kept', 'D']);
    await vi.waitFor(() =>
      expect(repo.updateElement).toHaveBeenCalledWith(
        store.form().id,
        c.id,
        { label: 'Kept' },
        { keepalive: false },
      ),
    );
  });

  it('sends an up/down move as the position it ends up at', async () => {
    const { group, d } = scenario();

    await store.moveElement(d.id, -1);

    expect(ids(childrenOf(group.id))).toEqual(['A', 'B', 'D']);
    expect(repo.moveElement).toHaveBeenCalledWith(store.form().id, d.id, {
      parentId: group.id,
      index: 2,
    });
  });

  it('counts the position only once an earlier queued removal is applied', async () => {
    const { page, c, d } = scenario();

    const removal = store.removeElement(c.id);
    const move = store.moveElementTo(d.id, page.id, 1);
    expect(ids(root())).toEqual(['C', 'D', 'Group']);
    await removal;
    await move;

    expect(repo.moveElement).toHaveBeenCalledWith(store.form().id, d.id, {
      parentId: page.id,
      index: 0,
    });
    expect(ids(root())).toEqual(['D', 'Group']);
  });

  it('sends nothing when an up/down move has nowhere to go', async () => {
    const { c } = scenario();

    await store.moveElement(c.id, -1);

    expect(repo.moveElement).not.toHaveBeenCalled();
    expect(ids(root())).toEqual(['C', 'Group', 'D']);
  });

  it('keeps the element in place when the target group does not exist', async () => {
    const { c } = scenario();
    const before = store.form().pages;

    await store.moveElementTo(c.id, 'missing-group', 0);

    expect(store.form().pages).toBe(before);
    expect(repo.moveElement).not.toHaveBeenCalled();
    expect(ids(root())).toEqual(['C', 'Group', 'D']);
  });
});

describe('DesignerStore server-side creation', () => {
  let store: DesignerStore;
  const calls: string[] = [];
  const clonedElement = text('Copy');
  const clonedPage = createPage('Page 2');
  const i18n = {
    t: vi.fn((key: string, params?: Record<string, unknown>) => {
      if (key === 'builder.copySuffix') return '(copy)';
      if (key === 'builder.pageN') return `Page ${String(params?.['n'])}`;
      return key;
    }),
  };
  const repo = {
    addPage: vi.fn(async (_formId: string, title: string) => {
      calls.push('addPage');
      return createPage(title);
    }),
    addElement: vi.fn(async (_formId: string, request: CreateElementRequest) => {
      calls.push('addElement');
      return createElement(request.type, request.label);
    }),
    cloneElement: vi.fn(async (_formId: string, _elementId: string, _suffix: string) => {
      calls.push('cloneElement');
      return { element: clonedElement, subtree: [] as ElementDefinition[] };
    }),
    clonePage: vi.fn(async (_formId: string, _pageId: string, _suffix: string) => {
      calls.push('clonePage');
      return { page: clonedPage, elements: [] as ElementDefinition[] };
    }),
    addOption: vi.fn(async (_formId: string, _elementId: string, request: CreateOptionRequest) => {
      calls.push('addOption');
      return { id: 'opt-new', label: request.label };
    }),
    updateOption: vi.fn(
      async (
        _formId: string,
        _elementId: string,
        _optionId: string,
        patch: UpdateOptionRequest,
      ) => {
        calls.push('updateOption');
        return { id: _optionId, label: patch.label ?? '' };
      },
    ),
    deleteOption: vi.fn(async () => {
      calls.push('deleteOption');
    }),
    moveOption: vi.fn(async () => {
      calls.push('moveOption');
    }),
    addValidationRule: vi.fn(
      async (_formId: string, _elementId: string, request: CreateValidationRuleRequest) => {
        calls.push('addValidationRule');
        return { id: 'rule-new', ...request };
      },
    ),
    updateValidationRule: vi.fn(
      async (
        _formId: string,
        _elementId: string,
        ruleId: string,
        patch: UpdateValidationRuleRequest,
      ) => {
        calls.push('updateValidationRule');
        return { id: ruleId, rule: 'required' as const, message: '', ...patch };
      },
    ),
    deleteValidationRule: vi.fn(async () => {
      calls.push('deleteValidationRule');
    }),
    updateElement: vi.fn(async (_formId: string, _elementId: string, _patch: ElementPatch) => {
      calls.push('updateElement');
      return text('Patched');
    }),
    deleteElement: vi.fn(async () => {
      calls.push('deleteElement');
    }),
    moveElement: vi.fn(async () => {
      calls.push('moveElement');
    }),
    updatePage: vi.fn(async (_formId: string, pageId: string, _patch: PagePatch) => {
      calls.push('updatePage');
      return createPage(pageId);
    }),
    deletePage: vi.fn(async () => {
      calls.push('deletePage');
    }),
    updateForm: vi.fn(async (_formId: string, _patch: FormPatch) => {
      calls.push('updateForm');
    }),
  };

  beforeEach(() => {
    localStorage.clear();
    calls.length = 0;
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        DesignerStore,
        { provide: FormsRepository, useValue: repo },
        { provide: I18nService, useValue: i18n },
      ],
    });
    store = TestBed.inject(DesignerStore);
  });

  function loaded(): { page: PageDefinition; group: GroupElement } {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const group = createElement('group', 'Group');
    addToGroup(text('Child'), group, form);
    addToGroup([text('A'), group, text('B')], page, form);
    form.pages = [page];
    store.load(form);
    return { page, group };
  }

  it('inserts the server-generated element after a sibling and selects it', async () => {
    const { page } = loaded();
    const el = await store.addElement(
      page.id,
      'number',
      'Age',
      getElements(page, store.form())[0].id,
    );

    expect(repo.addElement).toHaveBeenCalledWith(store.form().id, {
      type: 'number',
      label: 'Age',
      parentId: page.id,
      afterId: getElements(page, store.form())[0].id,
      defaults: {
        option: 'panel.option',
        scaleMin: 'builder.scaleMin',
        scaleMax: 'builder.scaleMax',
      },
    });
    expect(getElements(store.form().pages[0], store.form())[1]).toEqual(el);
    expect(store.selectedId()).toBe(el.id);
  });

  it('appends a server-generated child to a group', async () => {
    const { group } = loaded();
    const el = await store.addElement(group.id, 'text', 'Child 2');
    const stored = getElements(store.form().pages[0], store.form())[1] as GroupElement;
    expect(getElements(stored, store.form()).map((e) => e.id)).toEqual([
      getElements(group, store.form())[0].id,
      el.id,
    ]);
  });

  it('appends a server-generated page and activates it', async () => {
    loaded();
    const page = await store.addPage();
    expect(repo.addPage).toHaveBeenCalledWith(store.form().id, 'Page 2');
    expect(store.form().pages.at(-1)).toEqual(page);
    expect(store.activePageId()).toBe(page.id);
  });

  it('inserts the server-cloned element after its source and selects it', async () => {
    const { page, group } = loaded();
    const before = getElements(page, store.form());
    const copy = await store.duplicateElement(group.id);

    expect(repo.cloneElement).toHaveBeenCalledWith(store.form().id, group.id, '(copy)');
    expect(copy).toBe(clonedElement);
    expect(getElements(store.form().pages[0], store.form()).map((el) => el.id)).toEqual([
      before[0].id,
      group.id,
      clonedElement.id,
      before[2].id,
    ]);
    expect(store.selectedId()).toBe(clonedElement.id);
  });

  it('appends the server-cloned page and activates it', async () => {
    const { page, group } = loaded();
    store.select(group.id);

    const copy = await store.clonePage(page.id);

    expect(repo.clonePage).toHaveBeenCalledWith(store.form().id, page.id, '(copy)');
    expect(copy).toBe(clonedPage);
    expect(store.form().pages.at(-1)).toBe(clonedPage);
    expect(store.activePageId()).toBe(clonedPage.id);
    expect(store.selectedId()).toBeNull();
  });

  it('drops the duplicate locally when its source was removed during the request', async () => {
    const { page, group } = loaded();
    repo.cloneElement.mockImplementationOnce(async () => {
      store.load({
        ...store.form(),
        pages: [
          {
            ...page,
            children: getElements(page, store.form())
              .filter((el) => el.id !== group.id)
              .map((el) => el.id),
          },
        ],
      });
      return { element: clonedElement, subtree: [] };
    });

    const copy = await store.duplicateElement(group.id);

    expect(copy).toBeUndefined();
    expect(store.selectedId()).toBeNull();
    expect(getElements(store.form().pages[0], store.form())).toHaveLength(2);
  });

  function loadedChoice(options?: ChoiceOption[]): ChoiceElement {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const choice = createElement('dropdown', 'Pick') as ChoiceElement;
    if (options) choice.options = options;
    addToGroup(choice, page, form);
    form.pages = [page];
    store.load(form);
    return choice;
  }

  it('appends a server-generated option', async () => {
    const choice = loadedChoice();

    const option = await store.addOption(choice.id, 'Option 3');

    expect(calls).toEqual(['addOption']);
    expect(repo.addOption).toHaveBeenCalledWith(store.form().id, choice.id, { label: 'Option 3' });
    const stored = store.form().elements[choice.id] as ChoiceElement;
    expect(stored.options.at(-1)).toEqual(option);
    expect(stored.options).toHaveLength(3);
  });

  it('drops the option locally when its element was removed during the request', async () => {
    const choice = loadedChoice();
    repo.addOption.mockImplementationOnce(async (_formId, _elementId, request) => {
      store.load({
        ...store.form(),
        pages: [{ ...store.form().pages[0], children: [] }],
        elements: {},
      });
      return { id: 'opt-new', label: request.label };
    });

    await store.addOption(choice.id, 'Option 3');

    expect(store.form().elements[choice.id]).toBeUndefined();
  });

  it('appends a server-generated validation rule', async () => {
    const choice = loadedChoice();

    const rule = await store.addValidationRule(choice.id, { rule: 'required', message: 'Needed' });

    expect(calls).toEqual(['addValidationRule']);
    expect(repo.addValidationRule).toHaveBeenCalledWith(store.form().id, choice.id, {
      rule: 'required',
      message: 'Needed',
    });
    expect(rule).toEqual({ id: 'rule-new', rule: 'required', message: 'Needed' });
    const stored = store.form().elements[choice.id] as ChoiceElement;
    expect(stored.validations).toEqual([rule]);
  });

  it('drops the validation rule locally when its element was removed during the request', async () => {
    const choice = loadedChoice();
    repo.addValidationRule.mockImplementationOnce(async (_formId, _elementId, request) => {
      store.load({
        ...store.form(),
        pages: [{ ...store.form().pages[0], children: [] }],
        elements: {},
      });
      return { id: 'rule-new', ...request };
    });

    await store.addValidationRule(choice.id, { rule: 'required', message: 'Needed' });

    expect(store.form().elements[choice.id]).toBeUndefined();
  });

  describe('validation rule edits', () => {
    const rule = { id: 'r1', rule: 'required' as const, message: 'Needed' };
    const rulesOf = (id: string) => (store.form().elements[id] as ChoiceElement).validations;

    function choiceWithRule(): ChoiceElement {
      const choice = loadedChoice();
      store.load({
        ...store.form(),
        elements: { ...store.form().elements, [choice.id]: { ...choice, validations: [rule] } },
      });
      return choice;
    }

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const sentMessages = () =>
      repo.updateValidationRule.mock.calls.map(([, , , patch]) => patch.message);

    it('applies a rule edit locally and sends it to the server at once', async () => {
      const choice = choiceWithRule();

      store.patchValidationRule(choice.id, 'r1', { message: 'Please answer' });
      expect(rulesOf(choice.id)).toEqual([{ ...rule, message: 'Please answer' }]);
      await vi.advanceTimersByTimeAsync(0);

      expect(repo.updateValidationRule).toHaveBeenCalledWith(store.form().id, choice.id, 'r1', {
        message: 'Please answer',
      });
    });

    it('sends a rule edit again while it fails for a passing reason', async () => {
      const choice = choiceWithRule();
      repo.updateValidationRule.mockRejectedValueOnce(new Error('offline'));

      store.patchValidationRule(choice.id, 'r1', { message: 'Please answer' });
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);

      expect(sentMessages()).toEqual(['Please answer', 'Please answer']);
      expect(store.unsaved()).toBe(false);
    });

    it('keeps a rule edit that still fails after retrying as unsaved', async () => {
      const choice = choiceWithRule();
      failTimes(repo.updateValidationRule, ATTEMPTS, new ApiError('busy', 503));

      store.patchValidationRule(choice.id, 'r1', { message: 'Please answer' });
      await vi.advanceTimersByTimeAsync(RETRIES_MS);

      expect(repo.updateValidationRule).toHaveBeenCalledTimes(ATTEMPTS);
      expect(rulesOf(choice.id)).toEqual([{ ...rule, message: 'Please answer' }]);
      expect(store.unsaved()).toBe(true);
      expect(store.patchError()).toEqual({
        error: new ApiError('busy', 503),
        message: 'panel.patchRuleFailed',
      });
    });

    it('keeps a rule edit the server rejects and sends it again on request', async () => {
      const choice = choiceWithRule();
      repo.updateValidationRule.mockRejectedValueOnce(new ApiError('invalid', 400));

      store.patchValidationRule(choice.id, 'r1', { message: 'Please answer' });
      await vi.advanceTimersByTimeAsync(0);
      expect(rulesOf(choice.id)).toEqual([{ ...rule, message: 'Please answer' }]);
      expect(store.unsaved()).toBe(true);

      await store.retryFailed();
      expect(sentMessages()).toEqual(['Please answer', 'Please answer']);
      expect(store.unsaved()).toBe(false);
    });

    it('interrupts leaving until a retried rule edit has arrived', async () => {
      const choice = choiceWithRule();
      repo.updateValidationRule.mockRejectedValueOnce(new Error('offline'));

      store.patchValidationRule(choice.id, 'r1', { message: 'Please answer' });
      await vi.advanceTimersByTimeAsync(0);

      expect(store.interruptLeave()).toBe(true);
      expect(store.unsaved()).toBe(true);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
      expect(store.unsaved()).toBe(false);
      expect(store.interruptLeave()).toBe(false);
    });

    it('keeps leaving interrupted while a rule edit is pending after another edit arrived', async () => {
      const choice = choiceWithRule();
      repo.updateValidationRule.mockRejectedValueOnce(new Error('offline'));
      store.updateElement(choice.id, { label: 'Sent' });
      store.sendPending();
      store.patchValidationRule(choice.id, 'r1', { message: 'Please answer' });
      expect(store.interruptLeave()).toBe(true);

      await vi.advanceTimersByTimeAsync(0);
      expect(repo.updateElement).toHaveBeenCalledTimes(1);
      expect(store.unsaved()).toBe(true);

      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
      expect(store.unsaved()).toBe(false);
    });

    it('sends the latest value when an earlier edit of the same rule fails', async () => {
      const choice = choiceWithRule();
      let reject!: (error: unknown) => void;
      repo.updateValidationRule.mockImplementationOnce(
        () => new Promise((_resolve, rej) => (reject = rej)),
      );

      store.patchValidationRule(choice.id, 'r1', { message: 'First' });
      await vi.advanceTimersByTimeAsync(0);
      store.patchValidationRule(choice.id, 'r1', { message: 'Second' });
      reject(new ApiError('invalid', 400));
      await vi.advanceTimersByTimeAsync(0);

      expect(sentMessages()).toEqual(['First', 'Second']);
      expect(rulesOf(choice.id)).toEqual([{ ...rule, message: 'Second' }]);
      expect(store.unsaved()).toBe(false);
    });

    it('keeps the latest value as unsaved when consecutive edits of a rule all fail', async () => {
      const choice = choiceWithRule();
      failTimes(repo.updateValidationRule, 2, new ApiError('invalid', 400));

      store.patchValidationRule(choice.id, 'r1', { message: 'First' });
      await vi.advanceTimersByTimeAsync(0);
      store.patchValidationRule(choice.id, 'r1', { message: 'Second' });
      await vi.advanceTimersByTimeAsync(0);

      expect(rulesOf(choice.id)).toEqual([{ ...rule, message: 'Second' }]);
      expect(store.unsaved()).toBe(true);
      await store.retryFailed();
      expect(sentMessages()).toEqual(['First', 'Second', 'Second']);
      expect(store.unsaved()).toBe(false);
    });

    it('sends a queued rule edit to its form after another form is loaded', async () => {
      const choice = choiceWithRule();
      const first = store.form().id;
      const page = store.form().pages[0];
      const other = newForm('Other');
      other.pages = [createPage('Other page')];
      let release!: () => void;
      repo.addElement.mockImplementationOnce(async (_formId, request) => {
        await new Promise<void>((resolve) => (release = resolve));
        return createElement(request.type, request.label);
      });
      const pending = store.addElement(page.id, 'text');
      store.patchValidationRule(choice.id, 'r1', { message: 'Please answer' });
      await vi.advanceTimersByTimeAsync(0);
      store.load(other);
      release();

      await expect(pending).rejects.toThrow('form changed');
      await vi.advanceTimersByTimeAsync(0);
      expect(repo.updateValidationRule).toHaveBeenCalledWith(first, choice.id, 'r1', {
        message: 'Please answer',
      });
      expect(store.form()).toBe(other);
    });

    it('drops a failed rule edit once the rule is removed', async () => {
      const choice = choiceWithRule();
      repo.updateValidationRule.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.patchValidationRule(choice.id, 'r1', { message: 'Please answer' });
      await vi.advanceTimersByTimeAsync(0);
      expect(store.unsaved()).toBe(true);

      await store.removeValidationRule(choice.id, 'r1');
      await vi.advanceTimersByTimeAsync(0);

      expect(store.unsaved()).toBe(false);
      expect(repo.updateValidationRule).toHaveBeenCalledTimes(1);
    });

    it('removes a rule locally only after the server deleted it', async () => {
      const choice = choiceWithRule();

      await store.removeValidationRule(choice.id, 'r1');

      expect(calls).toEqual(['deleteValidationRule']);
      expect(rulesOf(choice.id)).toEqual([]);
    });

    it('keeps the rule when the server deletion fails', async () => {
      const choice = choiceWithRule();
      repo.deleteValidationRule.mockRejectedValueOnce(new Error('offline'));

      await expect(store.removeValidationRule(choice.id, 'r1')).rejects.toThrow('offline');

      expect(rulesOf(choice.id)).toEqual([rule]);
    });
  });

  describe('option edits', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('applies an edit at once and sends only the latest after the delay', async () => {
      const choice = loadedChoice();
      const option = choice.options[0];

      store.patchOption(choice.id, option.id, { label: 'First' });
      store.patchOption(choice.id, option.id, { label: 'Last' });

      const stored = store.form().elements[choice.id] as ChoiceElement;
      expect(stored.options[0].label).toBe('Last');
      expect(repo.updateOption).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateOption).toHaveBeenCalledTimes(1);
      expect(repo.updateOption).toHaveBeenCalledWith(
        store.form().id,
        choice.id,
        option.id,
        { label: 'Last' },
        { keepalive: false },
      );
      expect(calls).toEqual(['updateOption']);
      expect(store.patchError()).toBeNull();
    });

    it('sends a pending edit at once with keepalive when the page is closed', async () => {
      const choice = loadedChoice();
      const option = choice.options[0];

      store.patchOption(choice.id, option.id, { label: 'Closing' });
      window.dispatchEvent(new Event('pagehide'));

      expect(repo.updateOption).toHaveBeenCalledWith(
        store.form().id,
        choice.id,
        option.id,
        { label: 'Closing' },
        { keepalive: true },
      );
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      expect(repo.updateOption).toHaveBeenCalledTimes(1);
    });

    it('keeps the edit as unsaved when the send fails', async () => {
      const choice = loadedChoice();
      const option = choice.options[0];
      failTimes(repo.updateOption, ATTEMPTS, new Error('offline'));

      store.patchOption(choice.id, option.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS + RETRIES_MS);

      expect(repo.updateOption).toHaveBeenCalledTimes(ATTEMPTS);
      expect(store.unsaved()).toBe(true);
      expect(store.patchError()).toEqual({
        error: new Error('offline'),
        message: 'panel.patchOptionFailed',
      });
      const stored = store.form().elements[choice.id] as ChoiceElement;
      expect(stored.options[0].label).toBe('Kept');
    });

    it('drops a pending edit when the option is removed before it is sent', async () => {
      const choice = loadedChoice();
      const option = choice.options[0];

      store.patchOption(choice.id, option.id, { label: 'Doomed' });
      await store.removeOption(choice.id, option.id);
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateOption).not.toHaveBeenCalled();
      expect(repo.deleteOption).toHaveBeenCalledWith(store.form().id, choice.id, option.id);
      expect(calls).toEqual(['deleteOption']);
      const stored = store.form().elements[choice.id] as ChoiceElement;
      expect(stored.options.map((o) => o.id)).not.toContain(option.id);
    });

    it('removes the option locally when the server has it removed already', async () => {
      const choice = loadedChoice();
      const option = choice.options[0];
      repo.deleteOption.mockRejectedValueOnce(new ApiError('not found', 404));

      store.patchOption(choice.id, option.id, { label: 'Doomed' });
      await store.removeOption(choice.id, option.id);
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateOption).not.toHaveBeenCalled();
      const stored = store.form().elements[choice.id] as ChoiceElement;
      expect(stored.options.map((o) => o.id)).not.toContain(option.id);
      expect(store.unsaved()).toBe(false);
    });

    it('sends the dropped edit after all when deleting the option fails', async () => {
      const choice = loadedChoice();
      const option = choice.options[0];
      repo.deleteOption.mockRejectedValueOnce(new Error('delete failed'));

      store.patchOption(choice.id, option.id, { label: 'Retried' });
      await expect(store.removeOption(choice.id, option.id)).rejects.toThrow('delete failed');

      await vi.advanceTimersByTimeAsync(0);

      expect(repo.updateOption).toHaveBeenCalledWith(
        store.form().id,
        choice.id,
        option.id,
        { label: 'Retried' },
        { keepalive: false },
      );
      const stored = store.form().elements[choice.id] as ChoiceElement;
      expect(stored.options[0].label).toBe('Retried');
    });
  });

  describe('option moves', () => {
    const optionIds = (id: string) =>
      (store.form().elements[id] as ChoiceElement).options.map((o) => o.id);

    it('moves an option at once and sends its new index', async () => {
      const choice = loadedChoice();
      const [first, second] = choice.options.map((o) => o.id);

      await store.moveOption(choice.id, 0, 1);

      expect(optionIds(choice.id)).toEqual([second, first]);
      expect(repo.moveOption).toHaveBeenCalledWith(store.form().id, choice.id, first, {
        index: 1,
      });
    });

    it('sends nothing when the option is already at the edge', async () => {
      const choice = loadedChoice();

      await store.moveOption(choice.id, 0, -1);

      expect(repo.moveOption).not.toHaveBeenCalled();
    });

    it('moves the option back when the server rejects the move', async () => {
      const choice = loadedChoice();
      const before = optionIds(choice.id);
      repo.moveOption.mockRejectedValueOnce(new Error('offline'));

      await expect(store.moveOption(choice.id, 0, 1)).rejects.toThrow('offline');

      expect(optionIds(choice.id)).toEqual(before);
    });

    it('counts the index only once an earlier queued deletion is applied', async () => {
      const choice = loadedChoice([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ]);

      const removal = store.removeOption(choice.id, 'a');
      const move = store.moveOption(choice.id, 2, -1);
      expect(optionIds(choice.id)).toEqual(['a', 'c', 'b']);
      await removal;
      await move;

      expect(repo.moveOption).toHaveBeenCalledWith(store.form().id, choice.id, 'c', { index: 0 });
      expect(optionIds(choice.id)).toEqual(['c', 'b']);
    });

    it('takes back a later move unsent when an earlier one fails', async () => {
      const choice = loadedChoice([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ]);
      let fail!: (error: Error) => void;
      repo.moveOption.mockImplementationOnce(
        () => new Promise<undefined>((_, reject) => (fail = reject)),
      );

      const first = store.moveOption(choice.id, 0, 1);
      const second = store.moveOption(choice.id, 1, 1);
      expect(optionIds(choice.id)).toEqual(['b', 'c', 'a']);
      await vi.waitFor(() => expect(fail).toBeDefined());
      fail(new Error('offline'));

      await expect(first).rejects.toThrow('offline');
      await second;
      expect(repo.moveOption).toHaveBeenCalledTimes(1);
      expect(optionIds(choice.id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('element edits', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const element = (id: string) => store.form().elements[id];

    it('applies edits at once and sends them merged after the delay', async () => {
      const choice = loadedChoice();

      store.updateElement(choice.id, { label: 'Fir' });
      store.updateElement(choice.id, { label: 'First', required: true });

      expect(element(choice.id)).toMatchObject({ label: 'First', required: true });
      expect(repo.updateElement).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateElement).toHaveBeenCalledTimes(1);
      expect(repo.updateElement).toHaveBeenCalledWith(
        store.form().id,
        choice.id,
        { label: 'First', required: true },
        { keepalive: false },
      );
    });

    it('sends label, description and required edited one after another as one request', async () => {
      const choice = loadedChoice();
      const pause = () => vi.advanceTimersByTimeAsync(PATCH_DELAY_MS - 500);

      store.updateElement(choice.id, { label: 'Your name' });
      await pause();
      store.updateElement(choice.id, { description: 'As in your passport' });
      await pause();
      store.updateElement(choice.id, { required: true });
      expect(repo.updateElement).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateElement).toHaveBeenCalledTimes(1);
      expect(repo.updateElement).toHaveBeenCalledWith(
        store.form().id,
        choice.id,
        { label: 'Your name', description: 'As in your passport', required: true },
        { keepalive: false },
      );
    });

    it('sends the edits of an element at once when another element is selected', async () => {
      const { page, group } = loaded();
      const [first] = getElements(page, store.form());
      store.select(group.id);

      store.updateElement(group.id, { label: 'Renamed' });
      store.select(group.id);
      await vi.advanceTimersByTimeAsync(0);
      expect(repo.updateElement).not.toHaveBeenCalled();

      store.select(first.id);
      await vi.advanceTimersByTimeAsync(0);
      expect(repo.updateElement).toHaveBeenCalledWith(
        store.form().id,
        group.id,
        { label: 'Renamed' },
        { keepalive: false },
      );
    });

    it('removes a field set to undefined and sends null for it', async () => {
      const choice = loadedChoice();
      const condition = { logic: 'all' as const, conditions: [], groups: [] };
      store.updateElement(choice.id, { enabledWhen: condition });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      store.updateElement(choice.id, { enabledWhen: undefined });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(element(choice.id)).not.toHaveProperty('enabledWhen');
      expect(repo.updateElement).toHaveBeenLastCalledWith(
        store.form().id,
        choice.id,
        { enabledWhen: null },
        { keepalive: false },
      );
    });

    it('pairs up the children when a group takes its default from another group', () => {
      const { group } = loaded();
      const source = createElement('group', 'Source') as GroupElement;
      const sourceChild = text('Source child');
      addToGroup(sourceChild, source, store.form());
      addToGroup(source, store.form().pages[0], store.form());
      const [child] = getElements(group, store.form());

      store.updateElement(group.id, { defaultValue: { kind: 'fromField', fieldId: source.id } });

      expect(element(child.id)).toMatchObject({
        defaultValue: { kind: 'fromField', fieldId: sourceChild.id },
      });
    });

    it('sends a pending edit before a following creation', async () => {
      const { group } = loaded();

      store.updateElement(group.id, { label: 'Renamed' });
      await store.duplicateElement(group.id);

      expect(calls).toEqual(['updateElement', 'cloneElement']);
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      expect(repo.updateElement).toHaveBeenCalledTimes(1);
    });

    it('sends a pending edit at once with keepalive when the page is closed', () => {
      const choice = loadedChoice();

      store.updateElement(choice.id, { label: 'Closing' });
      window.dispatchEvent(new Event('pagehide'));

      expect(repo.updateElement).toHaveBeenCalledWith(
        store.form().id,
        choice.id,
        { label: 'Closing' },
        { keepalive: true },
      );
    });

    it('drops pending edits of a removed element and everything below it', async () => {
      const { group } = loaded();
      const [child] = getElements(group, store.form());

      store.updateElement(child.id, { label: 'Doomed' });
      await store.removeElement(group.id);
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateElement).not.toHaveBeenCalled();
      expect(calls).toEqual(['deleteElement']);
    });

    it('sends the dropped edit after all when removing the element fails', async () => {
      const { group } = loaded();
      repo.deleteElement.mockRejectedValueOnce(new Error('delete failed'));

      store.updateElement(group.id, { label: 'Kept' });
      await expect(store.removeElement(group.id)).rejects.toThrow('delete failed');
      await vi.advanceTimersByTimeAsync(0);

      expect(repo.updateElement).toHaveBeenCalledWith(
        store.form().id,
        group.id,
        { label: 'Kept' },
        { keepalive: false },
      );
    });

    it('keeps a newer edit sent while a failing removal was in flight', async () => {
      const { group } = loaded();
      let fail!: (error: Error) => void;
      repo.deleteElement.mockReturnValueOnce(new Promise<void>((_, reject) => (fail = reject)));

      store.updateElement(group.id, { label: 'Old', description: 'Kept' });
      const removal = store.removeElement(group.id);
      store.updateElement(group.id, { label: 'Newer' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      fail(new Error('delete failed'));
      await expect(removal).rejects.toThrow('delete failed');
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateElement).toHaveBeenCalledTimes(1);
      expect(repo.updateElement).toHaveBeenCalledWith(
        store.form().id,
        group.id,
        { label: 'Newer', description: 'Kept' },
        { keepalive: false },
      );
      expect(element(group.id)).toMatchObject({ label: 'Newer', description: 'Kept' });
    });

    it('deletes an element only after an edit already sent to it has arrived', async () => {
      const { group } = loaded();
      let arrive!: () => void;
      repo.updateElement.mockImplementationOnce(() => {
        calls.push('updateElement');
        return new Promise<TextElement>((resolve) => (arrive = () => resolve(text('Sent'))));
      });

      store.updateElement(group.id, { label: 'Sent' });
      store.sendEditsOf(group.id);
      const removal = store.removeElement(group.id);
      await vi.advanceTimersByTimeAsync(0);

      expect(repo.deleteElement).not.toHaveBeenCalled();
      arrive();
      await removal;

      expect(calls).toEqual(['updateElement', 'deleteElement']);
      expect(store.patchError()).toBeNull();
      expect(element(group.id)).toBeUndefined();
    });

    const sentLabels = () =>
      repo.updateElement.mock.calls.map(([, , patch]) => (patch as ElementPatch).label);

    it('sends an edit again while it fails for a passing reason', async () => {
      const choice = loadedChoice();
      repo.updateElement.mockRejectedValueOnce(new Error('offline'));
      repo.updateElement.mockRejectedValueOnce(new ApiError('busy', 503));

      store.updateElement(choice.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS + RETRY_DELAYS_MS[0]);
      expect(repo.updateElement).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1]);

      expect(sentLabels()).toEqual(['Kept', 'Kept', 'Kept']);
      expect(store.unsaved()).toBe(false);
      expect(store.patchError()).toBeNull();
    });

    it('retries with the latest value, not with one sent on closing the page meanwhile', async () => {
      const choice = loadedChoice();
      repo.updateElement.mockRejectedValueOnce(new Error('offline'));
      store.updateElement(choice.id, { label: 'First' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      // Changed while the retry waits, sent on closing, and shown again from the back/forward cache.
      store.updateElement(choice.id, { label: 'Second' });
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);

      expect(sentLabels()).toEqual(['First', 'Second', 'Second']);
      await expect(store.flush()).resolves.toBe(true);
    });

    it('reports an edit that still fails after retrying and keeps it as unsaved', async () => {
      const choice = loadedChoice();
      failTimes(repo.updateElement, ATTEMPTS, new Error('offline'));

      store.updateElement(choice.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS + RETRIES_MS);

      expect(repo.updateElement).toHaveBeenCalledTimes(ATTEMPTS);
      expect(store.unsaved()).toBe(true);
      expect(store.patchError()).toEqual({
        error: new Error('offline'),
        message: 'panel.patchElementFailed',
      });
      expect(element(choice.id).label).toBe('Kept');
    });

    it('does not send an edit again that the server rejects', async () => {
      const choice = loadedChoice();
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));

      store.updateElement(choice.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS + RETRIES_MS);

      expect(repo.updateElement).toHaveBeenCalledTimes(1);
      expect(store.unsaved()).toBe(true);
    });

    it('does not send an edit again whose answer does not match the expected schema', async () => {
      const choice = loadedChoice();
      const invalid = z.object({ id: z.string() }).safeParse({}).error;
      repo.updateElement.mockRejectedValueOnce(invalid);

      store.updateElement(choice.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS + RETRIES_MS);

      expect(repo.updateElement).toHaveBeenCalledTimes(1);
      expect(store.unsaved()).toBe(true);
    });

    it('sends the failed edits again on request', async () => {
      const choice = loadedChoice();
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(choice.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      await store.retryFailed();

      expect(sentLabels()).toEqual(['Kept', 'Kept']);
      expect(store.unsaved()).toBe(false);
    });

    it('takes a failed edit along with a later edit of the same element', async () => {
      const choice = loadedChoice();
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(choice.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      store.updateElement(choice.id, { required: true });
      expect(store.unsaved()).toBe(false);
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateElement).toHaveBeenLastCalledWith(
        store.form().id,
        choice.id,
        { label: 'Kept', required: true },
        { keepalive: false },
      );
      expect(store.unsaved()).toBe(false);
    });

    it('takes a failed edit along with a later one already waiting in the queue', async () => {
      const choice = loadedChoice();
      let reject!: (error: unknown) => void;
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((_resolve, rej) => (reject = rej)),
      );
      store.updateElement(choice.id, { label: 'First', description: 'Kept' });
      store.sendEditsOf(choice.id);
      await vi.advanceTimersByTimeAsync(0);
      store.updateElement(choice.id, { label: 'Second' });
      store.sendEditsOf(choice.id);

      reject(new ApiError('invalid', 400));
      await vi.advanceTimersByTimeAsync(0);

      expect(repo.updateElement).toHaveBeenLastCalledWith(
        store.form().id,
        choice.id,
        { label: 'Second', description: 'Kept' },
        { keepalive: false },
      );
      expect(store.unsaved()).toBe(false);
    });

    it('keeps the order of edits in between when a failed one is taken along', async () => {
      const choice = loadedChoice();
      const rejects: ((error: unknown) => void)[] = [];
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((_resolve, reject) => rejects.push(reject)),
      );
      const send = (patch: ElementPatch) => {
        store.updateElement(choice.id, patch);
        store.sendEditsOf(choice.id);
      };
      send({ label: 'A' });
      await vi.advanceTimersByTimeAsync(0);
      send({ label: 'B' });
      send({ required: true });

      rejects[0](new ApiError('invalid', 400));
      await vi.advanceTimersByTimeAsync(0);

      // B and C are sent as they are once the queue gets to them, so the older A can't win.
      expect(sentLabels()).toEqual(['A', 'B']);
      expect(repo.updateElement).toHaveBeenLastCalledWith(
        store.form().id,
        choice.id,
        { label: 'B', required: true },
        { keepalive: false },
      );
      expect(element(choice.id)).toMatchObject({ label: 'B', required: true });
      expect(store.unsaved()).toBe(false);
    });

    it('sends an edit made while the element was being sent once that arrived', async () => {
      const choice = loadedChoice();
      let arrive!: () => void;
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((resolve) => (arrive = () => resolve(text('A')))),
      );
      store.updateElement(choice.id, { label: 'A' });
      store.sendEditsOf(choice.id);
      await vi.advanceTimersByTimeAsync(0);

      store.updateElement(choice.id, { label: 'AB' });
      arrive();
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(sentLabels()).toEqual(['A', 'AB']);
      expect(element(choice.id).label).toBe('AB');
      expect(store.unsaved()).toBe(false);
    });

    it('sends the newer value, not failed, when a send fails after the field was edited again', async () => {
      const choice = loadedChoice();
      let reject!: (error: unknown) => void;
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((_resolve, rej) => (reject = rej)),
      );
      store.updateElement(choice.id, { label: 'Old', description: 'Kept' });
      store.sendEditsOf(choice.id);
      await vi.advanceTimersByTimeAsync(0);
      store.updateElement(choice.id, { label: 'New' });

      reject(new ApiError('invalid', 400));
      await vi.advanceTimersByTimeAsync(0);
      expect(store.unsaved()).toBe(false);
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateElement).toHaveBeenLastCalledWith(
        store.form().id,
        choice.id,
        { label: 'New', description: 'Kept' },
        { keepalive: false },
      );
      expect(store.unsaved()).toBe(false);
    });

    it('sends a waiting edit from the form it was made in and forgets a failed one on loading another', async () => {
      const choice = loadedChoice();
      const first = store.form().id;
      const option = choice.options[0];
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(choice.id, { label: 'Failed' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      store.patchOption(choice.id, option.id, { label: 'Waiting' });
      expect(store.unsaved()).toBe(true);

      loaded();
      expect(store.unsaved()).toBe(false);
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateOption).toHaveBeenCalledWith(
        first,
        choice.id,
        option.id,
        { label: 'Waiting' },
        { keepalive: false },
      );
      expect(repo.updateElement).toHaveBeenCalledTimes(1);
      expect(store.unsaved()).toBe(false);
    });

    it('keeps leaving interrupted while a held failed edit is sent again after a failed removal', async () => {
      const { group } = loaded();
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(group.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      let fail!: (error: Error) => void;
      repo.deleteElement.mockReturnValueOnce(new Promise<void>((_, reject) => (fail = reject)));
      let arrive!: () => void;
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((resolve) => (arrive = () => resolve(text('Kept')))),
      );

      const removal = store.removeElement(group.id);
      expect(store.interruptLeave()).toBe(true);
      fail(new Error('delete failed'));
      await expect(removal).rejects.toThrow('delete failed');
      await vi.advanceTimersByTimeAsync(0);

      expect(store.unsaved()).toBe(true);
      arrive();
      await vi.advanceTimersByTimeAsync(0);
      expect(store.unsaved()).toBe(false);
    });

    it('interrupts leaving while a failed edit is held for a pending removal', async () => {
      const { group } = loaded();
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(group.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      let fail!: (error: Error) => void;
      repo.deleteElement.mockReturnValueOnce(new Promise<void>((_, reject) => (fail = reject)));

      const removal = store.removeElement(group.id);
      expect(store.interruptLeave()).toBe(true);
      expect(store.unsaved()).toBe(true);

      fail(new Error('delete failed'));
      await expect(removal).rejects.toThrow('delete failed');
      await vi.advanceTimersByTimeAsync(0);
      expect(sentLabels()).toEqual(['Kept', 'Kept']);
      expect(store.unsaved()).toBe(false);
    });

    it('sends a failed edit of an element again before duplicating it', async () => {
      const { group } = loaded();
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(group.id, { label: 'Renamed' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      expect(store.unsaved()).toBe(true);

      await store.duplicateElement(group.id);

      // The rejected first send isn't logged in `calls`.
      expect(calls).toEqual(['updateElement', 'cloneElement']);
      expect(sentLabels()).toEqual(['Renamed', 'Renamed']);
      expect(store.unsaved()).toBe(false);
    });

    it('refuses to duplicate an element whose edit fails again', async () => {
      const { group } = loaded();
      failTimes(repo.updateElement, 2, new ApiError('invalid', 400));
      store.updateElement(group.id, { label: 'Renamed' });

      await expect(store.duplicateElement(group.id)).rejects.toThrow('unsaved edits');

      expect(repo.cloneElement).not.toHaveBeenCalled();
      expect(store.unsaved()).toBe(true);
    });

    it('refuses to clone a page while an edit of one of its elements fails', async () => {
      const { page, group } = loaded();
      failTimes(repo.updateElement, 2, new ApiError('invalid', 400));
      store.updateElement(group.id, { label: 'Renamed' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      await expect(store.clonePage(page.id)).rejects.toThrow('unsaved edits');
      expect(repo.clonePage).not.toHaveBeenCalled();
    });

    it('checks the edits of a child moved out of the source after duplicating was asked', async () => {
      const { page, group } = loaded();
      const [child] = getElements(group, store.form());
      failTimes(repo.updateElement, 2, new ApiError('invalid', 400));
      store.updateElement(child.id, { label: 'Renamed' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      // The server still has the child in the group when it copies it.
      const copy = store.duplicateElement(group.id);
      const move = store.moveElementTo(child.id, page.id, 0);

      await expect(copy).rejects.toThrow('unsaved edits');
      await move;
      expect(repo.cloneElement).not.toHaveBeenCalled();
    });

    it('does not duplicate once another form was loaded while the source was sent', async () => {
      const { group } = loaded();
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(group.id, { label: 'Renamed' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      let arrive!: () => void;
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((resolve) => (arrive = () => resolve(text('Renamed')))),
      );

      const copy = store.duplicateElement(group.id);
      const refused = expect(copy).rejects.toThrow('form changed');
      await vi.advanceTimersByTimeAsync(0);
      const other = newForm('Other');
      other.pages = [createPage('Other page')];
      store.load(other);
      arrive();

      await refused;
      expect(repo.cloneElement).not.toHaveBeenCalled();
    });

    it('keeps edits of two forms with the same element ids apart', async () => {
      const choice = loadedChoice();
      const first = store.form().id;
      store.updateElement(choice.id, { label: 'First' });
      // As an imported copy: other form, same element ids.
      const copy = { ...store.form(), id: newForm('Copy').id };
      store.load(copy);
      store.updateElement(choice.id, { label: 'Copy' });

      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateElement).toHaveBeenCalledWith(
        first,
        choice.id,
        { label: 'First' },
        { keepalive: false },
      );
      expect(repo.updateElement).toHaveBeenCalledWith(
        copy.id,
        choice.id,
        { label: 'Copy' },
        { keepalive: false },
      );
    });

    it('waits for edits made while flushing before telling everything arrived', async () => {
      const choice = loadedChoice();
      let arrive!: () => void;
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((resolve) => (arrive = () => resolve(text('First')))),
      );
      store.updateElement(choice.id, { label: 'First' });

      const flushed = store.flush();
      await vi.advanceTimersByTimeAsync(0);
      store.updateElement(choice.id, { description: 'Meanwhile' });
      arrive();

      await expect(flushed).resolves.toBe(true);
      expect(repo.updateElement).toHaveBeenLastCalledWith(
        store.form().id,
        choice.id,
        { description: 'Meanwhile' },
        { keepalive: false },
      );
    });

    it('keeps an edit as failed when sending it on closing the page fails', async () => {
      const choice = loadedChoice();
      repo.updateElement.mockRejectedValueOnce(new Error('offline'));
      store.updateElement(choice.id, { label: 'Closing' });

      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(0);
      expect(store.unsaved()).toBe(true);

      await store.retryFailed();
      expect(sentLabels()).toEqual(['Closing', 'Closing']);
      expect(store.unsaved()).toBe(false);
    });

    it('duplicates an element once a failed edit of it arrived with a later one', async () => {
      const { group } = loaded();
      let reject!: (error: unknown) => void;
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((_resolve, rej) => (reject = rej)),
      );
      store.updateElement(group.id, { label: 'First' });
      store.sendEditsOf(group.id);
      await vi.advanceTimersByTimeAsync(0);
      store.updateElement(group.id, { description: 'Second' });

      const copy = store.duplicateElement(group.id);
      reject(new ApiError('invalid', 400));
      await copy;

      expect(repo.updateElement).toHaveBeenLastCalledWith(
        store.form().id,
        group.id,
        { label: 'First', description: 'Second' },
        { keepalive: false },
      );
      expect(repo.cloneElement).toHaveBeenCalledTimes(1);
    });

    it('drops a failed edit of an element that is removed', async () => {
      const { group } = loaded();
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(group.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      await store.removeElement(group.id);

      expect(store.unsaved()).toBe(false);
      expect(repo.updateElement).toHaveBeenCalledTimes(1);
    });

    it('drops a failed edit of a child that a failed move put back into a removed group', async () => {
      const { page, group } = loaded();
      const [child] = getElements(group, store.form());
      let failMove!: (error: Error) => void;
      repo.moveElement.mockReturnValueOnce(new Promise<void>((_, reject) => (failMove = reject)));
      const move = store.moveElementTo(child.id, page.id, 0);
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(child.id, { label: 'Renamed' });
      store.sendEditsOf(child.id);
      // Out of the group as shown, so its edit is not held for the removal.
      const removal = store.removeElement(group.id);

      failMove(new Error('move failed'));
      await expect(move).rejects.toThrow('move failed');
      await removal;

      expect(store.form().elements[child.id]).toBeUndefined();
      expect(store.unsaved()).toBe(false);
    });

    it('sends the edits of a copy source one after another', async () => {
      const { group } = loaded();
      const [child] = getElements(group, store.form());
      failTimes(repo.updateElement, 2, new ApiError('invalid', 400));
      store.updateElement(group.id, { label: 'Group' });
      store.updateElement(child.id, { label: 'Child' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      let arrive!: () => void;
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((resolve) => (arrive = () => resolve(text('Group')))),
      );

      const copy = store.duplicateElement(group.id);
      await vi.advanceTimersByTimeAsync(0);
      expect(repo.updateElement).toHaveBeenCalledTimes(3);
      arrive();
      await copy;

      expect(sentLabels().slice(2)).toEqual(['Group', 'Child']);
      expect(calls.at(-1)).toBe('cloneElement');
    });

    it('sends an edit of a copy source made while it was being sent before copying', async () => {
      const { group } = loaded();
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(group.id, { label: 'Old' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      let arrive!: () => void;
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((resolve) => (arrive = () => resolve(text('Old')))),
      );

      const copy = store.duplicateElement(group.id);
      await vi.advanceTimersByTimeAsync(0);
      store.updateElement(group.id, { label: 'New' });
      arrive();
      await copy;

      expect(sentLabels()).toEqual(['Old', 'Old', 'New']);
      // Only the last send ('New') is logged in `calls`.
      expect(calls).toEqual(['updateElement', 'cloneElement']);
    });

    it('keeps a waiting edit when its form is loaded again before it is sent', async () => {
      const choice = loadedChoice();
      const form = structuredClone(store.form());
      store.updateElement(choice.id, { label: 'Waiting', description: 'Kept' });
      const other = newForm('Other');
      other.pages = [createPage('Other page')];
      store.load(other);

      // A fresh copy from the server, without the edit yet but with another change.
      store.load({ ...form, name: 'Renamed elsewhere' });

      expect(store.form().name).toBe('Renamed elsewhere');
      expect(element(choice.id)).toMatchObject({ label: 'Waiting', description: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      expect(repo.updateElement).toHaveBeenCalledWith(
        form.id,
        choice.id,
        { label: 'Waiting', description: 'Kept' },
        { keepalive: false },
      );
    });

    it('keeps a field sent twice at once when its form is loaded again after one send arrived', async () => {
      const choice = loadedChoice();
      const form = structuredClone(store.form());
      const answers: (() => void)[] = [];
      const held = () =>
        new Promise<TextElement>((resolve) => answers.push(() => resolve(text('Sent'))));
      repo.updateElement.mockImplementationOnce(held).mockImplementationOnce(held);
      store.updateElement(choice.id, { label: 'First' });
      store.sendEditsOf(choice.id);
      await vi.advanceTimersByTimeAsync(0);
      store.updateElement(choice.id, { label: 'Second' });
      window.dispatchEvent(new Event('pagehide'));
      expect(answers).toHaveLength(2);

      // The first send arrived; the one on closing the page still carries the label.
      answers[0]();
      await vi.advanceTimersByTimeAsync(0);
      const other = newForm('Other');
      other.pages = [createPage('Other page')];
      store.load(other);
      store.load(form);

      expect(element(choice.id)).toMatchObject({ label: 'Second' });
      answers[1]();
    });

    it('counts an edit sent on closing the page as being sent until it arrives', async () => {
      const choice = loadedChoice();
      let arrive!: () => void;
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((resolve) => (arrive = () => resolve(text('Closing')))),
      );
      store.updateElement(choice.id, { label: 'Closing' });
      window.dispatchEvent(new Event('pagehide'));

      // Shown again from the back/forward cache.
      expect(store.interruptLeave()).toBe(true);
      let flushed = false;
      void store.flush().then(() => (flushed = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(flushed).toBe(false);

      arrive();
      await vi.advanceTimersByTimeAsync(0);
      expect(flushed).toBe(true);
      expect(store.unsaved()).toBe(false);
    });

    it('does not keep a failed edit sent on closing the page once its element is removed', async () => {
      const { group } = loaded();
      let fail!: (error: Error) => void;
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((_, reject) => (fail = reject)),
      );
      store.updateElement(group.id, { label: 'Closing' });
      window.dispatchEvent(new Event('pagehide'));

      const removal = store.removeElement(group.id);
      await vi.advanceTimersByTimeAsync(0);
      fail(new Error('offline'));
      await removal;

      expect(store.unsaved()).toBe(false);
    });

    it('forgets failed edits once another form is loaded', async () => {
      const choice = loadedChoice();
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(choice.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      loaded();

      expect(store.unsaved()).toBe(false);
    });

    it('flushes pending edits and tells whether everything reached the server', async () => {
      const choice = loadedChoice();
      store.updateElement(choice.id, { label: 'Sent' });

      await expect(store.flush()).resolves.toBe(true);
      expect(repo.updateElement).toHaveBeenCalledTimes(1);

      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(choice.id, { label: 'Failed' });

      await expect(store.flush()).resolves.toBe(false);
    });

    /** Dispatches `beforeunload`; returns whether closing was interrupted. */
    const close = () => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }));

    it('lets the page close while no edit is being sent or failed', async () => {
      const choice = loadedChoice();
      expect(close()).toBe(false);

      // Waiting edits are sent on close (see `pagehide`).
      store.updateElement(choice.id, { label: 'Waiting' });
      expect(close()).toBe(false);
      expect(store.unsaved()).toBe(false);
    });

    it('interrupts closing while edits wait and the browser is offline', () => {
      const choice = loadedChoice();
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      try {
        expect(close()).toBe(false);

        store.updateElement(choice.id, { label: 'Waiting' });
        expect(close()).toBe(true);
      } finally {
        online.mockRestore();
      }
    });

    it('interrupts closing while an edit failed', async () => {
      const choice = loadedChoice();
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(choice.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(close()).toBe(true);
      expect(store.unsaved()).toBe(true);
    });

    it('interrupts closing while an edit is retried and shows it as unsaved at once', async () => {
      const choice = loadedChoice();
      repo.updateElement.mockRejectedValueOnce(new Error('offline'));
      store.updateElement(choice.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      expect(store.unsaved()).toBe(false);

      expect(close()).toBe(true);
      expect(store.unsaved()).toBe(true);

      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
      expect(store.unsaved()).toBe(false);
      expect(close()).toBe(false);
    });

    it('counts waiting edits as being sent once they are sent before leaving', async () => {
      const choice = loadedChoice();
      repo.updateElement.mockRejectedValueOnce(new Error('offline'));
      store.updateElement(choice.id, { label: 'Waiting' });

      store.sendPending();

      expect(repo.updateElement).not.toHaveBeenCalled();
      expect(store.interruptLeave()).toBe(true);
      expect(store.unsaved()).toBe(true);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
      expect(repo.updateElement).toHaveBeenCalledTimes(2);
      expect(store.unsaved()).toBe(false);
    });

    it('does not show a later edit as unsaved after leaving was interrupted by a failed one', async () => {
      const choice = loadedChoice();
      repo.updateElement.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateElement(choice.id, { label: 'Failed' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      expect(store.interruptLeave()).toBe(true);

      // Stayed: the next edit takes the failed one along and is sent as usual.
      let arrive!: () => void;
      repo.updateElement.mockImplementationOnce(
        () => new Promise<TextElement>((resolve) => (arrive = () => resolve(text('Kept')))),
      );
      store.updateElement(choice.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateElement).toHaveBeenCalledTimes(2);
      expect(store.unsaved()).toBe(false);
      arrive();
    });
  });

  describe('page edits', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const pageOf = (id: string) => store.form().pages.find((p) => p.id === id);
    const condition = { logic: 'all' as const, conditions: [], groups: [] };

    it('applies title and subtitle at once and sends them as one request', async () => {
      const { page } = loaded();

      store.updatePage(page.id, { title: 'Contact' });
      store.updatePage(page.id, { subtitle: 'How to reach you' });

      expect(pageOf(page.id)).toMatchObject({ title: 'Contact', subtitle: 'How to reach you' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updatePage).toHaveBeenCalledTimes(1);
      expect(repo.updatePage).toHaveBeenCalledWith(
        store.form().id,
        page.id,
        { title: 'Contact', subtitle: 'How to reach you' },
        { keepalive: false },
      );
    });

    it('leaves a title set to undefined as it is and does not send it', async () => {
      const { page } = loaded();
      store.updatePage(page.id, { title: undefined, subtitle: 'Sub' });

      expect(pageOf(page.id)).toMatchObject({ title: 'Page 1', subtitle: 'Sub' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      expect(repo.updatePage).toHaveBeenCalledWith(
        store.form().id,
        page.id,
        { subtitle: 'Sub' },
        { keepalive: false },
      );
    });

    it('removes the condition set to undefined and sends null for it', async () => {
      const { page } = loaded();
      store.updatePage(page.id, { enabledWhen: condition });
      store.updatePage(page.id, { enabledWhen: undefined });

      expect(pageOf(page.id)).not.toHaveProperty('enabledWhen');
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      expect(repo.updatePage).toHaveBeenCalledWith(
        store.form().id,
        page.id,
        { enabledWhen: null },
        { keepalive: false },
      );
    });

    it('sends the edits of a page at once when another page is activated', async () => {
      const { page } = loaded();
      const other = await store.addPage();
      store.selectPage(page.id);

      store.updatePage(page.id, { title: 'Contact' });
      store.selectPage(other.id);
      await vi.advanceTimersByTimeAsync(0);

      expect(repo.updatePage).toHaveBeenCalledWith(
        store.form().id,
        page.id,
        { title: 'Contact' },
        { keepalive: false },
      );
    });

    it('drops pending edits of a removed page and of its elements', async () => {
      const { page, group } = loaded();

      store.updatePage(page.id, { title: 'Doomed' });
      store.updateElement(group.id, { label: 'Doomed too' });
      await store.removePage(page.id);
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updatePage).not.toHaveBeenCalled();
      expect(repo.updateElement).not.toHaveBeenCalled();
    });

    it('reports a failed send with the page message', async () => {
      const { page } = loaded();
      failTimes(repo.updatePage, ATTEMPTS, new Error('offline'));

      store.updatePage(page.id, { title: 'Contact' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS + RETRIES_MS);

      expect(store.patchError()).toEqual({
        error: new Error('offline'),
        message: 'canvas.patchPageFailed',
      });
    });
  });

  describe('form edits', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('renames at once and sends the name after the delay', async () => {
      loaded();

      store.rename('Sign');
      store.rename('Sign-up');

      expect(store.form().name).toBe('Sign-up');
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateForm).toHaveBeenCalledTimes(1);
      expect(repo.updateForm).toHaveBeenCalledWith(
        store.form().id,
        { name: 'Sign-up' },
        { keepalive: false },
      );
    });

    it('merges settings edits field by field', async () => {
      loaded();

      store.updateSettings({ showProgress: false });
      store.updateSettings({ navigation: 'linear' });

      expect(store.form().settings).toMatchObject({ showProgress: false, navigation: 'linear' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);
      expect(repo.updateForm).toHaveBeenCalledWith(
        store.form().id,
        { settings: { showProgress: false, navigation: 'linear' } },
        { keepalive: false },
      );
    });

    it('merges the settings of a failed edit field by field into a later one', async () => {
      loaded();
      repo.updateForm.mockRejectedValueOnce(new ApiError('invalid', 400));
      store.updateSettings({ showProgress: false });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      store.updateSettings({ navigation: 'linear' });
      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateForm).toHaveBeenLastCalledWith(
        store.form().id,
        { settings: { showProgress: false, navigation: 'linear' } },
        { keepalive: false },
      );
    });

    it('sends a rename to the form it was made in after another form is loaded', async () => {
      loaded();
      const first = store.form().id;
      store.rename('First');
      const other = newForm('Other');
      other.pages = [createPage('Other page')];
      store.load(other);
      store.rename('Second');

      await vi.advanceTimersByTimeAsync(PATCH_DELAY_MS);

      expect(repo.updateForm).toHaveBeenCalledWith(first, { name: 'First' }, { keepalive: false });
      expect(repo.updateForm).toHaveBeenCalledWith(
        other.id,
        { name: 'Second' },
        { keepalive: false },
      );
    });
  });

  it('runs creations one at a time', async () => {
    const { page } = loaded();
    await Promise.all([store.addElement(page.id, 'text'), store.addElement(page.id, 'text')]);
    expect(calls).toEqual(['addElement', 'addElement']);
    expect(getElements(store.form().pages[0], store.form())).toHaveLength(5);
  });

  it('appends the element when its anchor sibling was removed during the request', async () => {
    const { page } = loaded();
    const anchor = getElements(page, store.form())[0];
    repo.addElement.mockImplementationOnce(async (_formId, request) => {
      store.load({
        ...store.form(),
        pages: [
          {
            ...page,
            children: getElements(page, store.form())
              .slice(1)
              .map((e) => e.id),
          },
        ],
      });
      return createElement(request.type, request.label);
    });
    const el = await store.addElement(page.id, 'text', 'New', anchor.id);
    expect(getElements(store.form().pages[0], store.form()).at(-1)).toEqual(el);
    expect(store.selectedId()).toBe(el.id);
  });

  it('does not select the element when its parent was removed during the request', async () => {
    const { page, group } = loaded();

    repo.addElement.mockImplementationOnce(async (_formId, request) => {
      store.load({
        ...store.form(),
        pages: [
          {
            ...page,
            children: getElements(page, store.form())
              .filter((e) => e.id !== group.id)
              .map((e) => e.id),
          },
        ],
      });
      delete store.form().elements[group.id];
      return createElement(request.type, request.label);
    });
    await store.addElement(group.id, 'text', 'Orphan');
    expect(getElements(store.form().pages[0], store.form())).toHaveLength(2);
    expect(store.selectedId()).toBeNull();
  });

  it('drops queued and pending creations once another form is loaded', async () => {
    const { page } = loaded();
    const other = newForm('Other');
    other.pages = [createPage('Other page')];
    let release!: () => void;
    repo.addElement.mockImplementationOnce(async (_formId, request) => {
      await new Promise<void>((resolve) => (release = resolve));
      return createElement(request.type, request.label);
    });
    const pending = store.addElement(page.id, 'text');
    const queued = store.addPage();
    await vi.waitFor(() => expect(release).toBeDefined());
    store.load(other);
    release();

    await expect(pending).rejects.toThrow('form changed');
    await expect(queued).rejects.toThrow('form changed');
    expect(repo.addPage).not.toHaveBeenCalled();
    expect(store.form()).toBe(other);
  });
});
