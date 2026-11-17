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
    form: () => ({ id: 'form-a' }),
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

  it('does not open the runner once the builder was left meanwhile', async () => {
    const { fixture, builder } = create();

    const preview = builder.preview();
    fixture.destroy();
    finishFlush(true);
    await preview;

    expect(navigate).not.toHaveBeenCalled();
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
