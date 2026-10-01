import { DragDropRegistry, type CdkDropList } from '@angular/cdk/drag-drop';
import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ElementDefinition } from '@shared/model/form.model';

/**
 * CDK hands predicates the `CdkDropList` of the hovered list, although the public types
 * claim `CdkDrag`/`CdkDragDrop`.
 */
type DropList = CdkDropList<ElementDefinition[]>;

/**
 * Sort predicate for the page and group drop lists.
 *
 * CDK makes room for its placeholder by displacing the other rows with a transform. The
 * drop zone of a group sits inside its row, so a displaced group carries its zone away
 * from the pointer approaching it, and CDK - comparing against the rect it cached at drag
 * start - never registers the drop. Refusing to displace groups keeps their zone in place.
 */
export function canSortAt(index: number, _dragged: unknown, drop: unknown): boolean {
  return (drop as DropList).data[index]?.type !== 'group';
}

/** Class of the drop zone of a group, see `element-row.html`. */
const GROUP_ZONE = '.group-children';

/**
 * Whether a drop list may take a pointer at the given client position.
 *
 * Outer lists enclose the zones of the groups nested inside them, so CDK considers them a
 * candidate for any pointer inside a nested group - and since it takes the first connected
 * list that can receive, an outer list would steal every drag sorted in an inner group.
 * A list therefore only takes a pointer over its own zone, or over no zone (a page row).
 */
export function isOwnZone(x: number, y: number, drop: unknown): boolean {
  const zone = document.elementFromPoint(x, y)?.closest(GROUP_ZONE);
  return !zone || zone === (drop as DropList).element.nativeElement;
}

/** Pointer of a mouse or touch event in client coordinates. */
export function pointerOf(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('clientX' in event) return { x: event.clientX, y: event.clientY };
  const touch = event.changedTouches[0];
  return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
}

/**
 * Pointer of the running drag, shared by all drop lists of the canvas.
 *
 * `cdkDropListEnterPredicate` gets no coordinates, so they come from the `pointerMove`
 * stream of the CDK registry. That stream covers every drag at any nesting depth, and since
 * this subscription exists before any drag starts it runs before the drag handles the same
 * event - the predicate always sees the current pointer.
 *
 * CDK asks the predicate two questions: once per drag, while the drag starts, whether a list
 * could receive the item at all, and then on every move whether it takes the pointer now.
 * Only the second may look at the zone under the pointer: refusing the first would leave the
 * outer lists unregistered, and then nothing could be dragged out of a group. A list that is
 * not receiving yet is being asked the first question.
 */
@Injectable()
export class DropDragState {
  private pointer = { x: 0, y: 0 };

  constructor() {
    inject(DragDropRegistry)
      .pointerMove.pipe(takeUntilDestroyed())
      .subscribe((event) => (this.pointer = pointerOf(event)));
  }

  /** `cdkDropListEnterPredicate` of the page drop list and of every group zone. */
  readonly canEnter = (_dragged: unknown, drop: unknown): boolean => {
    if (!(drop as DropList)._dropListRef.isReceiving()) return true;
    return isOwnZone(this.pointer.x, this.pointer.y, drop);
  };
}
