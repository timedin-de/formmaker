import { inject, signal, type Signal } from '@angular/core';
import type { TranslationKey } from './i18n/translation.service';
import { Notifier } from './notifier';

/** Something that runs async actions which block related controls while in flight. */
export interface HasPending {
  /** True while an action has not settled yet. */
  readonly isPending: Signal<boolean>;
}

/**
 * Base for components that run server actions (creations, deletions, submissions, ...)
 * one at a time with their controls disabled meanwhile: bind `[disabled]="isPending()"`
 * and start each action through `whilePending`. Must be constructed in an injection
 * context, as components are.
 */
export abstract class PendingActions implements HasPending {
  private readonly pendingNotifier = inject(Notifier);
  private readonly pending = signal(false);
  readonly isPending: Signal<boolean> = this.pending.asReadonly();

  /**
   * Runs `action` as pending, unless another action still is: then it is ignored, which
   * also stops a quick second click before the disabled controls have rendered. A failure
   * is reported under `failureKey` instead of being rethrown. Resolves to whether
   * `action` ran.
   */
  protected async whilePending(
    action: () => Promise<unknown>,
    failureKey: TranslationKey,
  ): Promise<boolean> {
    if (this.pending()) return false;
    this.pending.set(true);
    try {
      await action();
    } catch (error) {
      this.pendingNotifier.apiError(error, failureKey);
    } finally {
      this.pending.set(false);
    }
    return true;
  }
}
