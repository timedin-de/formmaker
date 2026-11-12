import { TestBed } from '@angular/core/testing';
import type { FormWithOwner } from '@shared/model/form.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FORM_CACHE_PREFIX, FORMS_CACHE_KEY, writeCache } from './api-cache';
import { ApiClient } from './api-client';
import { FormsRepository } from './forms.repository';

function form(id: string, name: string, updatedAt: string): FormWithOwner {
  return { id, name, updatedAt } as FormWithOwner;
}

describe('FormsRepository init', () => {
  const request = vi.fn();
  let repo: FormsRepository;

  beforeEach(() => {
    localStorage.clear();
    request.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { request } }] });
    repo = TestBed.inject(FormsRepository);
  });

  it('loads the list once while it succeeds', async () => {
    request.mockResolvedValue([form('f1', 'Form', '')]);

    await Promise.all([repo.init(), repo.init()]);
    await repo.init();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('tries again after the list failed to load', async () => {
    request.mockRejectedValueOnce(new Error('offline'));
    request.mockResolvedValueOnce([form('f1', 'Form', '')]);

    await expect(repo.init()).rejects.toThrow('offline');
    await repo.init();

    expect(request).toHaveBeenCalledTimes(2);
    expect(repo.forms().map((f) => f.name)).toEqual(['Form']);
  });
});

describe('FormsRepository updateForm', () => {
  const request = vi.fn();
  let repo: FormsRepository;

  beforeEach(() => {
    localStorage.clear();
    request.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { request } }] });
    repo = TestBed.inject(FormsRepository);
  });

  /** Answers the PATCH with `saved` and the list request with `listed`. */
  function respond(saved: FormWithOwner, listed: FormWithOwner[] | Error): void {
    request.mockImplementation((_schema: unknown, url: string) => {
      if (url !== '/api/forms') return Promise.resolve(saved);
      return listed instanceof Error ? Promise.reject(listed) : Promise.resolve(listed);
    });
  }

  it('loads the list before caching it, so other forms stay listed', async () => {
    const saved = form('f1', 'Renamed', '2026-01-02T00:00:00.000Z');
    respond(saved, [form('f1', 'Old', '2026-01-01T00:00:00.000Z'), form('f2', 'Other', '')]);

    await repo.updateForm('f1', { name: 'Renamed' });

    expect(repo.forms().map((f) => f.name)).toEqual(['Renamed', 'Other']);
  });

  it('keeps a later save of the form that the list loaded after the PATCH', async () => {
    const saved = form('f1', 'Renamed', '2026-01-02T00:00:00.000Z');
    respond(saved, [form('f1', 'Renamed again', '2026-01-03T00:00:00.000Z')]);

    await repo.updateForm('f1', { name: 'Renamed' });

    expect(repo.forms().map((f) => f.name)).toEqual(['Renamed again']);
  });

  it('drops the cached form and resolves when only the list fails to load', async () => {
    const key = FORM_CACHE_PREFIX + 'f1';
    writeCache(key, { id: 'f1' });
    const saved = form('f1', 'Renamed', '2026-01-02T00:00:00.000Z');
    respond(saved, new Error('offline'));

    await expect(repo.updateForm('f1', { name: 'Renamed' })).resolves.toBe(saved);

    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(FORMS_CACHE_KEY)).toBeNull();
  });
});
