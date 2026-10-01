import type { APIRequestContext, Locator } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import {
  createForm,
  deleteForm,
  getForm,
  login,
  loginApi,
  makeForm,
  seedField,
  seedGroup,
  uniqueName,
  uuid,
  type StoredForm,
} from './helpers';

// The designer canvas is a scrollable column: keep the whole page in the viewport
// so no drag source or drop target has to be scrolled into.
test.use({ viewport: { width: 1280, height: 1400 } });

/** Labels of the page root questions, in canvas order. */
function rootLabels(page: Page): Locator {
  return page.locator('#dropList_main > .cdk-drag > fm-element-row > .row > .row-head .name');
}

/** Labels of the questions nested in a group, in canvas order. */
function groupLabels(page: Page, groupId: string): Locator {
  return page.locator(
    `#dropList_${groupId} > .group-drag-container > fm-element-row > .row > .row-head .name`,
  );
}

/** First question of the page, i.e. drop target index 0 of the root drop list. */
function firstRootRow(page: Page): Locator {
  return page.locator('#dropList_main > .cdk-drag > fm-element-row > .row').first();
}

/** First question inside a group, i.e. drop target index 0 of its child drop list. */
function firstGroupRow(page: Page, groupId: string): Locator {
  return page
    .locator(`#dropList_${groupId} > .group-drag-container > fm-element-row > .row`)
    .first();
}

/**
 * Drag the question `label` to the top of `target` with real mouse input, so CDK
 * runs its whole sequence: the drag threshold, hit-testing of the drop list under
 * the pointer, sorting and finally the drop event.
 *
 * `target` has to be an empty drop list or the first item of the target list,
 * because dropping near the top of an item is what CDK resolves to index 0.
 */
async function dragInto(page: Page, label: Locator, target: Locator): Promise<void> {
  const from = await label.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag endpoints are not visible');

  const start = { x: from.x + Math.min(from.width / 2, 40), y: from.y + from.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // CDK only starts dragging once the pointer passes its threshold.
  await page.mouse.move(start.x + 10, start.y + 10, { steps: 4 });
  await page.mouse.move(to.x + 40, to.y + 5, { steps: 12 });
  // Entering a nested group moves the placeholder out of the page list, which reflows
  // the rows below it. One more event lets CDK hit-test the settled layout, which is
  // what a hand that keeps moving over the target does anyway.
  await page.mouse.move(to.x + 41, to.y + 5);
  await page.mouse.up();
}

/** Single page with the given root elements; the group id is passed in. */
async function seedCanvas(
  prefix: string,
  request: APIRequestContext,
  root: (groupId: string) => Record<string, unknown>[],
): Promise<{ session: Awaited<ReturnType<typeof loginApi>>; formId: string; groupId: string }> {
  const session = await loginApi(request);
  const groupId = uuid();
  const formId = await createForm(
    session,
    makeForm(uniqueName(prefix), [{ title: 'Canvas', elements: root(groupId) }]),
  );
  return { session, formId, groupId };
}

function outline(form: StoredForm): [string, string[]][] {
  return form.pages[0].elements.map((el) => [el.label, el.elements?.map((c) => c.label) ?? []]);
}

async function openBuilder(page: Page, formId: string, labels: string[]): Promise<void> {
  await login(page);
  await page.goto(`/builder?id=${formId}`);
  await expect(rootLabels(page)).toHaveText(labels);
}

test('drags a question into an empty group and persists the move', async ({ page, request }) => {
  // An empty group is the hard case: nothing sorts inside it, so the drop only registers
  // when its zone survives the reflow CDK causes by moving the placeholder out of the
  // page list. The group sits above the dragged row, which keeps that reflow away from
  // the pointer - with the group below it, CDK enters and leaves the group again on the
  // next pointer event (see drop-sort.ts).
  const { session, formId, groupId } = await seedCanvas('drag-into-group', request, (id) => [
    seedGroup(id, 'Group', []),
    seedField('text', uuid(), 'First'),
  ]);
  await openBuilder(page, formId, ['Group', 'First']);

  await dragInto(
    page,
    rootLabels(page).filter({ hasText: /^First$/ }),
    page.locator(`#dropList_${groupId}`),
  );

  await expect(rootLabels(page)).toHaveText(['Group']);
  await expect(groupLabels(page, groupId)).toHaveText(['First']);

  // The drop went through the store, so saving persists the reordered tree.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => outline(await getForm(session, formId)))
    .toEqual([['Group', ['First']]]);

  await deleteForm(session, formId);
});

test('sorts the questions inside a group', async ({ page, request }) => {
  const { session, formId, groupId } = await seedCanvas('drag-sort-in-group', request, (id) => [
    seedGroup(id, 'Group', [
      seedField('text', uuid(), 'A'),
      seedField('text', uuid(), 'B'),
      seedField('text', uuid(), 'C'),
    ]),
  ]);
  await openBuilder(page, formId, ['Group']);
  await expect(groupLabels(page, groupId)).toHaveText(['A', 'B', 'C']);

  await dragInto(
    page,
    groupLabels(page, groupId).filter({ hasText: /^C$/ }),
    firstGroupRow(page, groupId),
  );

  await expect(groupLabels(page, groupId)).toHaveText(['C', 'A', 'B']);

  await deleteForm(session, formId);
});

test('drags a question out of a group back onto the page', async ({ page, request }) => {
  const { session, formId, groupId } = await seedCanvas('drag-out-of-group', request, (id) => [
    seedField('text', uuid(), 'First'),
    seedGroup(id, 'Group', [seedField('text', uuid(), 'Inner')]),
    seedField('text', uuid(), 'Last'),
  ]);
  await openBuilder(page, formId, ['First', 'Group', 'Last']);
  await expect(groupLabels(page, groupId)).toHaveText(['Inner']);

  await dragInto(
    page,
    groupLabels(page, groupId).filter({ hasText: /^Inner$/ }),
    firstRootRow(page),
  );

  await expect(rootLabels(page)).toHaveText(['Inner', 'First', 'Group', 'Last']);
  await expect(groupLabels(page, groupId)).toHaveText([]);

  await deleteForm(session, formId);
});

test('reorders questions on the page by dragging', async ({ page, request }) => {
  const { session, formId } = await seedCanvas('drag-reorder', request, (id) => [
    seedField('text', uuid(), 'First'),
    seedGroup(id, 'Group', [seedField('text', uuid(), 'Inner')]),
    seedField('text', uuid(), 'Last'),
  ]);
  await openBuilder(page, formId, ['First', 'Group', 'Last']);

  await dragInto(page, rootLabels(page).filter({ hasText: /^Last$/ }), firstRootRow(page));

  await expect(rootLabels(page)).toHaveText(['Last', 'First', 'Group']);

  await deleteForm(session, formId);
});

test('sorts the questions inside a nested group', async ({ page, request }) => {
  // The outer group zone and the page list both enclose the nested zone, so either would
  // take the drag over if it only checked its own bounds (see drop-sort.ts).
  const innerId = uuid();
  const { session, formId } = await seedCanvas('drag-sort-nested', request, (id) => [
    seedGroup(id, 'Outer', [
      seedField('text', uuid(), 'Before'),
      seedGroup(innerId, 'Inner', [
        seedField('text', uuid(), 'A'),
        seedField('text', uuid(), 'B'),
        seedField('text', uuid(), 'C'),
      ]),
    ]),
  ]);
  await openBuilder(page, formId, ['Outer']);
  await expect(groupLabels(page, innerId)).toHaveText(['A', 'B', 'C']);

  await dragInto(
    page,
    groupLabels(page, innerId).filter({ hasText: /^C$/ }),
    firstGroupRow(page, innerId),
  );

  await expect(groupLabels(page, innerId)).toHaveText(['C', 'A', 'B']);

  await deleteForm(session, formId);
});
