import {
  type ElementDefinition,
  FORM_SCHEMA_VERSION,
  type FormDefinition,
  type FormDocument,
  type GroupElement,
  type PageDefinition,
  uuid,
} from '@shared/model';
import { createPage } from '@shared/model/form-factory';

export function newForm(name = 'Untitled form'): FormDefinition {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    name,
    description: '',
    version: 1,
    schemaVersion: FORM_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    settings: {
      submitLabel: 'Submit',
      showProgress: true,
      allowBack: true,
      navigation: 'auto',
      enableAutoSave: true,
    },
    pages: [createPage()],
    elements: {},
  };
}

/** A group with its children inline, for describing forms in specs. */
export type GroupNode = Omit<GroupElement, 'children'> & { elements: ElementNode[] };
export type ElementNode = Exclude<ElementDefinition, GroupElement> | GroupNode;
/** A page with its root elements inline, for describing forms in specs. */
export type PageNode = Omit<PageDefinition, 'children'> & { elements: ElementNode[] };

/** `group` with the given children; any `children` it already has are replaced. */
export function groupNode(group: GroupElement, elements: ElementNode[]): GroupNode {
  return { ...group, elements };
}

/** `page` with the given root elements; any `children` it already has are replaced. */
export function pageNode(page: PageDefinition, elements: ElementNode[]): PageNode {
  return { ...page, elements };
}

/** Builds the pages and element map of a form from pages with inline children. */
export function documentFromTree(pages: PageNode[]): FormDocument {
  const elements: Record<string, ElementDefinition> = {};
  const add = (nodes: ElementNode[]): string[] =>
    nodes.map((node) => {
      if (node.type === 'group') {
        const { elements: nested, ...group } = node;
        elements[node.id] = { ...group, children: add(nested) };
      } else {
        elements[node.id] = node;
      }
      return node.id;
    });
  return {
    pages: pages.map(({ elements: nodes, ...page }) => ({ ...page, children: add(nodes) })),
    elements,
  };
}

/** A new form whose pages and elements come from `pages`. */
export function formWith(pages: PageNode[], name?: string): FormDefinition {
  return { ...newForm(name), ...documentFromTree(pages) };
}
