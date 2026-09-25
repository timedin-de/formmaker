import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type { FormWithOwner } from '@shared/model/form.model';
import { beforeEach, describe, expect, it } from 'vitest';
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
