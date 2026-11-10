import { TestBed } from '@angular/core/testing';
import { createElement, createPage } from '@shared/model/form-factory';
import type {
  ChoiceElement,
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
} from '@shared/schemas';
import { addToGroup, getElements, newForm } from '@test/helper';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nService } from '../i18n/translation.service';
import { DesignerStore, OPTION_PATCH_DELAY_MS } from './designer.store';
import { FormsRepository } from './forms.repository';

function text(label: string): TextElement {
  return createElement('text', label) as TextElement;
}

describe('DesignerStore moveElementTo', () => {
  let store: DesignerStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [DesignerStore] });
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

  it('moves a top-level element into a group', () => {
    const { group, c } = scenario();

    store.moveElementTo(c.id, group.id, 1);

    expect(ids(root())).toEqual(['Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['A', 'C', 'B']);
  });

  it('moves a group child back out to the page root', () => {
    const { page, group, a } = scenario();

    store.moveElementTo(a.id, page.id, 0);

    expect(ids(root())).toEqual(['A', 'C', 'Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['B']);
  });

  it('moves an element between two groups', () => {
    const { d } = scenario();
    const other = createElement('group', 'Other') as GroupElement;
    addToGroup(text('E'), other, store.form());
    const page = store.form().pages[0];
    addToGroup(other, page, store.form());

    store.moveElementTo(d.id, other.id, 0);

    expect(ids(root())).toEqual(['C', 'Group', 'Other']);
    expect(ids(childrenOf(other.id))).toEqual(['D', 'E']);
  });

  it('reorders within the same container', () => {
    const { group, a } = scenario();

    store.moveElementTo(a.id, group.id, 1);

    expect(ids(childrenOf(group.id))).toEqual(['B', 'A']);
  });

  it('clamps an out-of-range index instead of dropping the element', () => {
    const { group, a } = scenario();

    store.moveElementTo(a.id, group.id, 99);

    expect(ids(childrenOf(group.id))).toEqual(['B', 'A']);
  });

  it('refuses to move a group into its own descendant', () => {
    const { group } = scenario();
    const inner = createElement('group', 'Inner') as GroupElement;
    addToGroup(text('F'), inner, store.form());
    addToGroup(inner, group, store.form());
    const innerId = childrenOf(group.id).at(-1)?.id as string;

    store.moveElementTo(group.id, innerId, 0);

    expect(ids(root())).toEqual(['C', 'Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['A', 'B', 'Inner']);
    expect(ids(childrenOf(innerId))).toEqual(['F']);
  });

  it('persists the move and marks the form dirty', () => {
    const { group, c } = scenario();
    expect(store.dirty()).toBe(false);

    store.moveElementTo(c.id, group.id, 0);

    expect(store.dirty()).toBe(true);
    expect(store.form().updatedAt).not.toBe('');
    expect(ids(childrenOf(group.id))).toEqual(['C', 'A', 'B']);
  });

  it('keeps the element in place when the target group does not exist', () => {
    const { c } = scenario();
    const before = store.form().pages;

    store.moveElementTo(c.id, 'missing-group', 0);

    expect(store.form().pages).toBe(before);
    expect(store.dirty()).toBe(false);
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
    saveForm: vi.fn(async () => calls.push('save')),
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
    addValidationRule: vi.fn(
      async (_formId: string, _elementId: string, request: CreateValidationRuleRequest) => {
        calls.push('addValidationRule');
        return { id: 'rule-new', ...request };
      },
    ),
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
    expect(store.dirty()).toBe(false);
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
    expect(store.dirty()).toBe(false);
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
    expect(store.dirty()).toBe(false);
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

  it('saves unsaved edits before cloning', async () => {
    const { group } = loaded();
    store.rename('Renamed');

    await store.duplicateElement(group.id);

    expect(calls).toEqual(['save', 'cloneElement']);
  });

  function loadedChoice(): ChoiceElement {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const choice = createElement('dropdown', 'Pick') as ChoiceElement;
    addToGroup(choice, page, form);
    form.pages = [page];
    store.load(form);
    return choice;
  }

  it('saves unsaved edits, then appends a server-generated option', async () => {
    const choice = loadedChoice();
    store.updateElement(choice.id, { label: 'Renamed' });

    const option = await store.addOption(choice.id, 'Option 3');

    expect(calls).toEqual(['save', 'addOption']);
    expect(repo.addOption).toHaveBeenCalledWith(store.form().id, choice.id, { label: 'Option 3' });
    const stored = store.form().elements[choice.id] as ChoiceElement;
    expect(stored.options.at(-1)).toEqual(option);
    expect(stored.options).toHaveLength(3);
    expect(store.dirty()).toBe(false);
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

  it('saves unsaved edits, then appends a server-generated validation rule', async () => {
    const choice = loadedChoice();
    store.updateElement(choice.id, { label: 'Renamed' });

    const rule = await store.addValidationRule(choice.id, { rule: 'required', message: 'Needed' });

    expect(calls).toEqual(['save', 'addValidationRule']);
    expect(repo.addValidationRule).toHaveBeenCalledWith(store.form().id, choice.id, {
      rule: 'required',
      message: 'Needed',
    });
    expect(rule).toEqual({ id: 'rule-new', rule: 'required', message: 'Needed' });
    const stored = store.form().elements[choice.id] as ChoiceElement;
    expect(stored.validations).toEqual([rule]);
    expect(store.dirty()).toBe(false);
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
      expect(store.dirty()).toBe(false);
      expect(repo.updateOption).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(OPTION_PATCH_DELAY_MS);

      expect(repo.updateOption).toHaveBeenCalledTimes(1);
      expect(repo.updateOption).toHaveBeenCalledWith(store.form().id, choice.id, option.id, {
        label: 'Last',
      });
      expect(calls).toEqual(['updateOption']);
      expect(store.optionPatchError()).toBeNull();
    });

    it('saves unsaved edits before sending a pending option edit', async () => {
      const choice = loadedChoice();
      const option = choice.options[0];
      store.rename('Renamed');

      store.patchOption(choice.id, option.id, { label: 'Renamed option' });
      await vi.advanceTimersByTimeAsync(OPTION_PATCH_DELAY_MS);

      expect(calls).toEqual(['save', 'updateOption']);
      expect(store.dirty()).toBe(false);
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
      await vi.advanceTimersByTimeAsync(OPTION_PATCH_DELAY_MS);
      expect(repo.updateOption).toHaveBeenCalledTimes(1);
    });

    it('keeps the edit and marks the form dirty when the send fails', async () => {
      const choice = loadedChoice();
      const option = choice.options[0];
      repo.updateOption.mockRejectedValueOnce(new Error('offline'));

      store.patchOption(choice.id, option.id, { label: 'Kept' });
      await vi.advanceTimersByTimeAsync(OPTION_PATCH_DELAY_MS);

      expect(store.dirty()).toBe(true);
      expect(store.optionPatchError()).toEqual(new Error('offline'));
      const stored = store.form().elements[choice.id] as ChoiceElement;
      expect(stored.options[0].label).toBe('Kept');
    });

    it('drops a pending edit when the option is removed before it is sent', async () => {
      const choice = loadedChoice();
      const option = choice.options[0];

      store.patchOption(choice.id, option.id, { label: 'Doomed' });
      await store.removeOption(choice.id, option.id);
      await vi.advanceTimersByTimeAsync(OPTION_PATCH_DELAY_MS);

      expect(repo.updateOption).not.toHaveBeenCalled();
      expect(repo.deleteOption).toHaveBeenCalledWith(store.form().id, choice.id, option.id);
      expect(calls).toEqual(['deleteOption']);
      const stored = store.form().elements[choice.id] as ChoiceElement;
      expect(stored.options.map((o) => o.id)).not.toContain(option.id);
      expect(store.dirty()).toBe(false);
    });

    it('sends the dropped edit after all when deleting the option fails', async () => {
      const choice = loadedChoice();
      const option = choice.options[0];
      repo.deleteOption.mockRejectedValueOnce(new Error('delete failed'));

      store.patchOption(choice.id, option.id, { label: 'Retried' });
      await expect(store.removeOption(choice.id, option.id)).rejects.toThrow('delete failed');

      await vi.advanceTimersByTimeAsync(0);

      expect(repo.updateOption).toHaveBeenCalledWith(store.form().id, choice.id, option.id, {
        label: 'Retried',
      });
      const stored = store.form().elements[choice.id] as ChoiceElement;
      expect(stored.options[0].label).toBe('Retried');
    });
  });

  it('saves unsaved edits before creating, and runs creations one at a time', async () => {
    const { page } = loaded();
    store.rename('Renamed');
    await Promise.all([store.addElement(page.id, 'text'), store.addElement(page.id, 'text')]);
    expect(calls).toEqual(['save', 'addElement', 'addElement']);
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
