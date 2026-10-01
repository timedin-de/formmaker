import { DragDropRegistry, type CdkDropList } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElementDefinition } from '@shared/model/form.model';
import { DropDragState, canSortAt, isOwnZone, pointerOf } from './drop-sort';

const element = (type: string) => ({ type }) as unknown as ElementDefinition;

/**
 * CDK sets `CdkDropList.data` to the directive itself and hands that instance to the sort
 * predicate, so the elements are one `.data` level down.
 */
const list = (data: ElementDefinition[]) =>
  ({ data }) as unknown as CdkDropList<ElementDefinition[]>;

describe('canSortAt', () => {
  it('refuses to displace a group so its drop zone stays reachable', () => {
    const page = list([element('text'), element('group'), element('text')]);

    expect(canSortAt(0, 'text', page)).toBe(true);
    expect(canSortAt(1, 'text', page)).toBe(false);
    expect(canSortAt(2, 'text', page)).toBe(true);
  });

  it('keeps sorting the other children of a group that holds groups', () => {
    const children = list([element('group'), element('text')]);

    expect(canSortAt(0, 'text', children)).toBe(false);
    expect(canSortAt(1, 'text', children)).toBe(true);
  });

  it('allows an index the list does not have, e.g. the append position', () => {
    expect(canSortAt(2, 'text', list([element('text')]))).toBe(true);
    expect(canSortAt(0, 'text', list([]))).toBe(true);
  });
});

describe('isOwnZone', () => {
  const page = document.createElement('div');
  const outer = document.createElement('div');
  outer.className = 'group-children';
  const outerRow = document.createElement('div');
  const inner = document.createElement('div');
  inner.className = 'group-children';
  const innerRow = document.createElement('div');
  outer.append(outerRow, inner);
  inner.append(innerRow);
  page.append(outer);
  document.body.append(page);

  // The predicate of CDK gets the drop list, not its data, see canSortAt.
  const list = (el: Element) => ({ element: { nativeElement: el } });
  // jsdom has no hit testing.
  const at = (hit: Element | null, drop: unknown = list(outer)) => {
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => hit,
    });
    return isOwnZone(10, 10, drop);
  };

  it('lets a nested zone take a pointer of its own zone', () => {
    expect(at(innerRow, list(inner))).toBe(true);
    expect(at(inner, list(inner))).toBe(true);
  });

  it('refuses a pointer of a nested zone to the enclosing zone and to the page list', () => {
    expect(at(innerRow)).toBe(false);
    expect(at(inner, list(page))).toBe(false);
  });

  it('accepts a pointer of its own rows and of the page', () => {
    expect(at(outerRow)).toBe(true);
    expect(at(page, list(page))).toBe(true);
    expect(at(null)).toBe(true);
  });
});

describe('DropDragState', () => {
  const inner = document.createElement('div');
  inner.className = 'group-children';
  document.body.append(inner);

  let state: DropDragState;
  let registry: DragDropRegistry;
  let receiving: boolean;
  const drop = {
    element: { nativeElement: document.createElement('div') },
    _dropListRef: { isReceiving: () => receiving },
  };

  const hit = (element: Element) =>
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => element,
    });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DropDragState] });
    state = TestBed.inject(DropDragState);
    registry = TestBed.inject(DragDropRegistry);
    receiving = true;
  });

  it('answers the setup of a drag even for a pointer of another zone', () => {
    hit(inner);

    receiving = false;
    expect(state.canEnter(null, drop)).toBe(true);

    receiving = true;
    expect(state.canEnter(null, drop)).toBe(false);
  });

  it('follows the pointer of the drag registry', () => {
    const at = vi.fn(() => document.body);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: at });

    registry.pointerMove.next(new MouseEvent('mousemove', { clientX: 7, clientY: 9 }));

    expect(state.canEnter(null, drop)).toBe(true);
    expect(at).toHaveBeenCalledWith(7, 9);
  });
});

describe('pointerOf', () => {
  it('reads the coordinates of a mouse event', () => {
    const event = new MouseEvent('mousemove', { clientX: 12, clientY: 34 });

    expect(pointerOf(event)).toEqual({ x: 12, y: 34 });
  });

  it('falls back to the touch of the event', () => {
    const event = new Event('touchstart') as TouchEvent;
    Object.defineProperty(event, 'changedTouches', {
      value: [{ clientX: 56, clientY: 78 }],
    });

    expect(pointerOf(event)).toEqual({ x: 56, y: 78 });
  });

  it('survives a touch event without touches', () => {
    const event = new Event('touchstart') as TouchEvent;
    Object.defineProperty(event, 'changedTouches', { value: [] });

    expect(pointerOf(event)).toEqual({ x: 0, y: 0 });
  });
});
