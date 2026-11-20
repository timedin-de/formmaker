import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NEVER, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nService } from '../core/i18n';
import { Notifier } from '../core/notifier';
import { DesignerStore } from '../core/state/designer.store';
import { FormsRepository } from '../core/state/forms.repository';
import { BuilderComponent } from './builder';
import { PropertiesModal } from './properties-modal';

describe('BuilderComponent.preview', () => {
  let finishFlush: (saved: boolean) => void;
  const store = {
    _form: () => ({ id: 'form-a' }),
    form: () => ({ id: 'form-a' }),
    sent: async () => undefined,
    flush: vi.fn(() => new Promise<boolean>((resolve) => (finishFlush = resolve))),
    patchError: signal(null),
    unsaved: signal(false),
  };
  let navigate: ReturnType<typeof vi.spyOn>;
  let queryParams: Subject<Record<string, string>>;

  function create() {
    const fixture = TestBed.createComponent(BuilderComponent);
    return { fixture, builder: fixture.componentInstance };
  }

  beforeEach(() => {
    store.flush.mockClear();
    queryParams = new Subject();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParams } },
        // Forms asked for keep loading.
        { provide: FormsRepository, useValue: { getForm: () => new Promise(() => undefined) } },
        { provide: Notifier, useValue: { ok: vi.fn(), apiError: vi.fn() } },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    });
    // Only the component's logic: no template, and the store it provides replaced.
    TestBed.overrideComponent(BuilderComponent, {
      set: {
        template: '',
        imports: [],
        providers: [
          { provide: DesignerStore, useValue: store },
          { provide: PropertiesModal, useValue: {} },
        ],
      },
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('opens the runner once every edit has reached the server', async () => {
    const { builder } = create();

    const preview = builder.preview();
    finishFlush(true);
    await preview;

    expect(navigate).toHaveBeenCalledWith(['/runner', 'form-a']);
  });

  it('stays in the builder when edits did not reach the server', async () => {
    const { builder } = create();

    const preview = builder.preview();
    finishFlush(false);
    await preview;

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not open the runner once another form is asked for, while it still loads', async () => {
    const { builder } = create();

    const preview = builder.preview();
    queryParams.next({ id: 'form-b' });
    finishFlush(true);
    await preview;

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does nothing while another form loads', async () => {
    const { builder } = create();
    queryParams.next({ id: 'form-b' });

    await builder.preview();

    expect(store.flush).not.toHaveBeenCalled();
  });

  it('does not open the runner once the builder was left meanwhile', async () => {
    const { fixture, builder } = create();

    const preview = builder.preview();
    fixture.destroy();
    finishFlush(true);
    await preview;

    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('BuilderComponent loading', () => {
  const queryParams = new Subject<Record<string, string>>();
  const route = { queryParams, snapshot: { queryParams: {} as Record<string, string> } };
  /** Emits `params` as the route's query params, as the router does. */
  function ask(params: Record<string, string>): void {
    route.snapshot.queryParams = params;
    queryParams.next(params);
  }
  const answers = new Map<
    string,
    { resolve: (form: unknown) => void; reject: (e: unknown) => void }
  >();
  const repo = {
    getForm: vi.fn(
      (id: string) => new Promise((resolve, reject) => answers.set(id, { resolve, reject })),
    ),
  };
  let sent: () => void;
  const store = {
    _form: vi.fn((): { id: string } | undefined => undefined),
    sent: vi.fn(() => new Promise<void>((resolve) => (sent = resolve))),
    load: vi.fn(),
    selectPage: vi.fn(),
    activePageId: () => 'p1',
    patchError: signal(null),
    unsaved: signal(false),
  };
  const notifier = { ok: vi.fn(), apiError: vi.fn() };
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    answers.clear();
    vi.clearAllMocks();
    store._form.mockReturnValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: route },
        { provide: FormsRepository, useValue: repo },
        { provide: Notifier, useValue: notifier },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    });
    TestBed.overrideComponent(BuilderComponent, {
      set: {
        template: '',
        imports: [],
        providers: [
          { provide: DesignerStore, useValue: store },
          { provide: PropertiesModal, useValue: {} },
        ],
      },
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    TestBed.createComponent(BuilderComponent);
  });

  it('fetches a form only once its edits still being sent have arrived', async () => {
    queryParams.next({ id: 'form-b' });
    await Promise.resolve();
    expect(store.sent).toHaveBeenCalledWith('form-b');
    expect(repo.getForm).not.toHaveBeenCalled();

    sent();
    await vi.waitFor(() => expect(repo.getForm).toHaveBeenCalledWith('form-b'));
  });

  it('loads only the form asked for last, also when an earlier one arrives later', async () => {
    queryParams.next({ id: 'form-b' });
    sent();
    queryParams.next({ id: 'form-c' });
    sent();
    await vi.waitFor(() => expect(answers.has('form-c')).toBe(true));

    answers.get('form-c')!.resolve({ id: 'form-c', pages: [] });
    await vi.waitFor(() => expect(store.load).toHaveBeenCalled());
    answers.get('form-b')!.resolve({ id: 'form-b', pages: [] });
    await new Promise((resolve) => setTimeout(resolve));

    expect(store.load.mock.calls).toEqual([[{ id: 'form-c', pages: [] }]]);
  });

  it('keeps the shown form when it is asked for again while another one loads', async () => {
    store._form.mockReturnValue({ id: 'form-a' });
    ask({ id: 'form-b' });
    sent();
    await vi.waitFor(() => expect(answers.has('form-b')).toBe(true));
    ask({ id: 'form-a' });

    answers.get('form-b')!.resolve({ id: 'form-b', pages: [] });
    await new Promise((resolve) => setTimeout(resolve));

    expect(repo.getForm.mock.calls).toEqual([['form-b']]);
    expect(store.load).not.toHaveBeenCalled();
  });

  it('selects the page asked for while the form loads once it is loaded', async () => {
    ask({ id: 'form-b', page: 'p1' });
    ask({ id: 'form-b', page: 'p2' });
    expect(store.selectPage).not.toHaveBeenCalled();

    sent();
    await vi.waitFor(() => expect(answers.has('form-b')).toBe(true));
    answers.get('form-b')!.resolve({ id: 'form-b', pages: [] });

    await vi.waitFor(() => expect(store.load).toHaveBeenCalled());
    expect(store.selectPage.mock.calls).toEqual([['p2']]);
  });

  it('reports a form that could not be opened and goes back to the list', async () => {
    queryParams.next({ id: 'form-b' });
    sent();
    await vi.waitFor(() => expect(answers.has('form-b')).toBe(true));
    const error = new Error('not found');
    answers.get('form-b')!.reject(error);

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/']));
    expect(notifier.apiError).toHaveBeenCalledWith(error, 'builder.loadFailed');
    expect(store.load).not.toHaveBeenCalled();
  });
});

describe('BuilderComponent leave dialog', () => {
  @Component({ template: '' })
  class Elsewhere {}

  const store = {
    sendPending: vi.fn(),
    interruptLeave: () => true,
    unsaved: signal(true),
    patchError: signal(null),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'builder',
            component: BuilderComponent,
            canDeactivate: [(builder: BuilderComponent) => builder.canLeave()],
          },
          { path: 'elsewhere', component: Elsewhere },
        ]),
        { provide: FormsRepository, useValue: {} },
        { provide: Notifier, useValue: { ok: vi.fn(), apiError: vi.fn() } },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    });
    TestBed.overrideComponent(BuilderComponent, {
      set: {
        template: '',
        imports: [],
        providers: [
          { provide: DesignerStore, useValue: store },
          { provide: PropertiesModal, useValue: {} },
          { provide: ActivatedRoute, useValue: { queryParams: NEVER } },
        ],
      },
    });
  });

  it('closes once a newer navigation cancels the one it asks about', async () => {
    const harness = await RouterTestingHarness.create('/builder');
    const builder = harness.routeDebugElement!.componentInstance as BuilderComponent;
    const router = TestBed.inject(Router);

    const leaving = router.navigateByUrl('/elsewhere');
    await vi.waitFor(() => expect(builder['leaving']()).toBe(true));

    // Another page of the same form runs no guard, so nothing answers the dialog.
    await router.navigateByUrl('/builder?page=p2');

    await expect(leaving).resolves.toBe(false);
    expect(builder['leaving']()).toBe(false);
    expect(router.url).toBe('/builder?page=p2');
  });
});
