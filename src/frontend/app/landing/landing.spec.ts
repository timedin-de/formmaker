import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type { FormWithOwner } from '@shared/model/form.model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormImportService } from '../core/export/import';
import { I18nService } from '../core/i18n';
import { FormsRepository } from '../core/state/forms.repository';
import { LandingComponent } from './landing';

/** `svgIcon` names referenced by the landing template. */
const ICONS = [
  'upload_file',
  'add',
  'note_add',
  'play_circle_outline',
  'edit',
  'bar_chart',
  'link',
  'download',
  'delete_outline',
];

function makeForm(updatedAt?: string): FormWithOwner {
  const base: FormWithOwner = {
    id: '1',
    name: 'Demo',
    description: '',
    version: 1,
    schemaVersion: 1,
    createdAt: updatedAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: undefined as never,
    settings: {
      submitLabel: 'Submit',
      showProgress: true,
      allowBack: true,
      navigation: 'auto',
      enableAutoSave: true,
    },
    pages: [],
    ownerId: '1',
    owner: {
      id: '1',
      email: 'ada@example.test',
      role: 'editor',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };
  return updatedAt ? { ...base, updatedAt } : base;
}

describe('LandingComponent.updated', () => {
  let component: LandingComponent;
  let i18n: I18nService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        I18nService,
        provideRouter([]),
        {
          provide: FormsRepository,
          useValue: { init: () => Promise.resolve(), listForms: async () => [] },
        },
        { provide: MatSnackBar, useValue: {} },
        FormImportService,
      ],
    }).compileComponents();

    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    const svg = sanitizer.bypassSecurityTrustHtml(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>',
    );
    for (const name of ICONS) registry.addSvgIconLiteral(name, svg);

    const fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    i18n = TestBed.inject(I18nService);
  });

  it('splits a timestamp into localized date and time', () => {
    const stamp = '2026-01-02T03:04:05.000Z';
    const result = component.updated(makeForm(stamp));

    const expected = new Date(stamp);
    expect(result).toEqual({
      date: expected.toLocaleDateString(),
      time: expected.toLocaleTimeString(),
    });
    expect(result.date).not.toBe(expected.toLocaleTimeString());
  });

  it('falls back to the n/a translation when no updatedAt is set', () => {
    const fallback = i18n.t('landing.updated');
    expect(component.updated(makeForm())).toEqual({ date: fallback, time: fallback });
  });

  it('shows the owner label and initials', () => {
    const form = makeForm();
    expect(component.ownerLabel(form)).toBe('ada@example.test');
    expect(component.ownerInitials(form)).toBe('A');
  });

  it('falls back when the owner is missing', () => {
    const form = makeForm();
    form.owner = null;
    expect(component.ownerLabel(form)).toBe(i18n.t('landing.ownerUnknown'));
    expect(component.ownerInitials(form)).toBe('?');
  });
});

describe('LandingComponent actions', () => {
  const open = vi.fn();
  const listForms = vi.fn();
  const deleteForm = vi.fn();
  const onImport = vi.fn();
  const importJson = vi.fn();
  let component: LandingComponent;
  let i18n: I18nService;

  beforeEach(async () => {
    open.mockReset();
    deleteForm.mockReset();
    onImport.mockReset();
    importJson.mockReset();
    listForms.mockReset();
    listForms.mockResolvedValue([]);
    await TestBed.configureTestingModule({
      providers: [
        I18nService,
        provideRouter([]),
        {
          provide: FormsRepository,
          useValue: { init: () => Promise.resolve(), listForms, deleteForm },
        },
        { provide: MatSnackBar, useValue: { open } },
        { provide: FormImportService, useValue: { onImport, importJson } },
      ],
    })
      .overrideComponent(LandingComponent, { remove: { imports: [MatSnackBarModule] } })
      .compileComponents();
    component = TestBed.createComponent(LandingComponent).componentInstance;
    i18n = TestBed.inject(I18nService);
    await vi.waitFor(() => expect(listForms).toHaveBeenCalledTimes(1)); // constructor refresh
    listForms.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('counts questions across groups, ignoring sections', () => {
    const form = {
      pages: [
        {
          elements: [
            { type: 'text' },
            { type: 'section' },
            {
              type: 'group',
              elements: [{ type: 'text' }, { type: 'number' }, { type: 'section' }],
            },
          ],
        },
        { elements: [{ type: 'text' }] },
      ],
    } as unknown as FormWithOwner;
    expect(component.countQuestions(form)).toBe(4);
  });

  it('refresh loads forms from the repository', async () => {
    const forms = [makeForm('2026-01-01T00:00:00.000Z')];
    listForms.mockResolvedValue(forms);
    await component.refresh();
    expect(component.forms()).toEqual(forms);
  });

  it('derives owner initials from separators', () => {
    const form = makeForm();
    form.owner = { ...form.owner!, email: 'grace.m_hopper@example.test' };
    expect(component.ownerInitials(form)).toBe('GM');
    form.owner = { ...form.owner, email: '@example.test' };
    expect(component.ownerInitials(form)).toBe('?');
  });

  it('exports a slugified JSON file', () => {
    const form = makeForm();
    form.name = '  My Form! v2  ';
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('my-form-v2.json');
    });
    component.exportJson(form);
    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('copies the share link and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await component.copyShareLink(makeForm());
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/runner/1`);
    expect(open.mock.calls[0][0]).toBe(i18n.t('landing.linkCopied'));
  });

  it('shows the link when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    await component.copyShareLink(makeForm());
    expect(open.mock.calls[0][0]).toBe(`${location.origin}/runner/1`);
  });

  it('refreshes only after a successful file import', async () => {
    onImport.mockResolvedValueOnce(undefined);
    await component.onImport(new Event('change'));
    expect(listForms).not.toHaveBeenCalled();

    onImport.mockResolvedValueOnce(makeForm());
    await component.onImport(new Event('change'));
    expect(listForms).toHaveBeenCalledTimes(1);
  });

  it('importText closes the modal on cancel', async () => {
    component['showTextModal'].set(true);
    await component.importText(null);
    expect(component['showTextModal']()).toBe(false);
    expect(importJson).not.toHaveBeenCalled();
  });

  it('importText keeps the modal open when the import fails', async () => {
    component['showTextModal'].set(true);
    importJson.mockResolvedValue(undefined);
    await component.importText('{}');
    expect(component['showTextModal']()).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it('importText closes, refreshes and notifies on success', async () => {
    component['showTextModal'].set(true);
    importJson.mockResolvedValue(makeForm());
    await component.importText('{}');
    expect(component['showTextModal']()).toBe(false);
    expect(listForms).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toBe(i18n.t('landing.imported', { name: 'Demo' }));
  });

  it('remove deletes then refreshes', async () => {
    await component.remove(makeForm());
    expect(deleteForm).toHaveBeenCalledWith('1');
    expect(listForms).toHaveBeenCalledTimes(1);
  });

  it('opens the menu on hover and closes it shortly after leaving', () => {
    vi.useFakeTimers();
    const trigger = { openMenu: vi.fn(), closeMenu: vi.fn() };
    component.mouseEnter(trigger);
    expect(trigger.openMenu).toHaveBeenCalled();

    component.mouseLeave(trigger);
    component.mouseEnter(trigger); // cancels the pending close
    vi.advanceTimersByTime(100);
    expect(trigger.closeMenu).not.toHaveBeenCalled();

    component.mouseLeave(trigger);
    vi.advanceTimersByTime(100);
    expect(trigger.closeMenu).toHaveBeenCalledTimes(1);
  });
});
