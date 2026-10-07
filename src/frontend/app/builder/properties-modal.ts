import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { DesignerStore } from '../core/state/designer.store';

const NARROW_QUERY = '(max-width: 1100px)';

/**
 * The property panel does not fit next to the canvas on narrow screens, so there it is shown in a
 * modal. Provided by the builder so rows can request it without knowing about the dialog.
 */
@Injectable()
export class PropertiesModal {
  private readonly store = inject(DesignerStore);

  /** True when the layout is too narrow for the inline panel. */
  readonly narrow = signal(false);
  private readonly requested = signal(false);
  readonly open = computed(
    () => this.narrow() && this.requested() && !!this.store.selectedElement(),
  );

  constructor() {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(NARROW_QUERY);
    this.narrow.set(query.matches);
    const onChange = (e: MediaQueryListEvent): void => this.narrow.set(e.matches);
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  }

  show(): void {
    this.requested.set(true);
  }

  close(): void {
    this.requested.set(false);
  }
}
