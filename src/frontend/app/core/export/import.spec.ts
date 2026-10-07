import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { FormDefinition } from '@shared/model/form.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nService } from '../i18n';
import { FormsRepository } from '../state/forms.repository';
import { FormImportService } from './import';

const validForm = {
  id: 'f1',
  name: 'Imported',
  version: 1,
  schemaVersion: 1,
  settings: { navigation: 'auto' },
  pages: [],
};

function fileEvent(file?: File): Event {
  return { target: { files: file ? [file] : [] } } as unknown as Event;
}

describe('FormImportService', () => {
  let service: FormImportService;
  let i18n: I18nService;
  const open = vi.fn();
  const newForm = vi.fn();

  beforeEach(() => {
    open.mockReset();
    newForm.mockReset();
    newForm.mockImplementation(async (f: FormDefinition) => f);
    TestBed.configureTestingModule({
      providers: [
        I18nService,
        { provide: MatSnackBar, useValue: { open } },
        { provide: FormsRepository, useValue: { newForm } },
      ],
    });
    service = TestBed.inject(FormImportService);
    i18n = TestBed.inject(I18nService);
  });

  it('importJson persists a valid form and strips ownership', async () => {
    const form = await service.importJson(
      JSON.stringify({ ...validForm, ownerId: 'u1', owner: null }),
    );
    expect(form?.name).toBe('Imported');
    expect(newForm).toHaveBeenCalledTimes(1);
    expect(newForm.mock.calls[0][0]).not.toHaveProperty('ownerId');
    expect(open).not.toHaveBeenCalled();
  });

  it('importJson reports invalid JSON without saving', async () => {
    expect(await service.importJson('{nope')).toBeUndefined();
    expect(newForm).not.toHaveBeenCalled();
    expect(open.mock.calls[0][0]).toBe(
      i18n.t('import.failed', { message: i18n.t('import.badJson') }),
    );
  });

  it('importJson rejects JSON that does not match the schema', async () => {
    expect(await service.importJson(JSON.stringify({ ...validForm, schemaVersion: 2 }))).toBe(
      undefined,
    );
    expect(newForm).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('onImport ignores events without a file', async () => {
    expect(await service.onImport(fileEvent())).toBeUndefined();
    expect(open).not.toHaveBeenCalled();
  });

  it('onImport imports a selected file and confirms', async () => {
    const file = new File([JSON.stringify(validForm)], 'form.json', { type: 'application/json' });
    const form = await service.onImport(fileEvent(file));
    expect(form?.id).toBe('f1');
    expect(open.mock.calls[0][0]).toBe(i18n.t('import.success'));
  });

  it('onImport reports an empty or unreadable file', async () => {
    const empty = new File([''], 'empty.json');
    expect(await service.onImport(fileEvent(empty))).toBeUndefined();
    expect(newForm).not.toHaveBeenCalled();
    expect(open.mock.calls[0][0]).toBe(
      i18n.t('import.failed', { message: i18n.t('import.badFile') }),
    );
  });

  it('onImport does not confirm when the content is invalid', async () => {
    const file = new File(['{}'], 'bad.json');
    expect(await service.onImport(fileEvent(file))).toBeUndefined();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).not.toBe(i18n.t('import.success'));
  });
});
