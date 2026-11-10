import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationKey } from './i18n/translation.service';
import { Notifier } from './notifier';
import { PendingActions } from './pending-actions';

class Actions extends PendingActions {
  run(action: () => Promise<unknown>): Promise<boolean> {
    return this.whilePending(action, 'panel.addRuleFailed' satisfies TranslationKey);
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  return { promise, resolve };
}

describe('PendingActions', () => {
  const apiError = vi.fn();
  let actions: Actions;

  beforeEach(() => {
    apiError.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: Notifier, useValue: { apiError } }] });
    actions = TestBed.runInInjectionContext(() => new Actions());
  });

  it('is pending while an action runs', async () => {
    const action = deferred();

    const run = actions.run(() => action.promise);
    expect(actions.isPending()).toBe(true);
    action.resolve();
    await run;

    expect(actions.isPending()).toBe(false);
    expect(apiError).not.toHaveBeenCalled();
  });

  it('reports a failed action and stops being pending', async () => {
    const error = new Error('offline');

    await actions.run(() => Promise.reject(error));

    expect(apiError).toHaveBeenCalledWith(error, 'panel.addRuleFailed');
    expect(actions.isPending()).toBe(false);
  });

  it('ignores a second action while one is pending', async () => {
    const first = deferred();
    const second = vi.fn(() => Promise.resolve());

    const run = actions.run(() => first.promise);
    await expect(actions.run(second)).resolves.toBe(false);
    first.resolve();

    await expect(run).resolves.toBe(true);
    expect(second).not.toHaveBeenCalled();
    expect(actions.isPending()).toBe(false);
  });
});
