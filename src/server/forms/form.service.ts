import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FORM_VERSION } from '@shared/consts';
import { evalConditionGroup, validateElementValue } from '@shared/engine';
import { isQuestionOrGroup } from '@shared/helper';
import {
  childrenOf,
  createElement,
  createPage,
  type ElementDefinition,
  elementId,
  FORM_SCHEMA_VERSION,
  type FormDefinition,
  insertIntoParent,
  type PageDefinition,
  type SubmissionCreate,
  uuid,
} from '@shared/model';
import { type CreateElementRequest } from '@shared/schemas';
import { Repository, type User } from '../repository';

/** A stored form together with its owner, as loaded by `Repository.form`. */
interface OwnedForm {
  form: FormDefinition;
  ownerId: string;
}

@Injectable()
export class FormService {
  constructor(@Inject(Repository) private readonly repository: Repository) {}

  async getForm(id: string) {
    return await this.repository.form(id);
  }

  async newForm(user: User) {
    const now = new Date().toISOString();
    const form: FormDefinition = {
      id: uuid(),
      owner: user,
      description: '',
      version: 1,
      schemaVersion: FORM_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      settings: {
        showProgress: true,
        allowBack: true,
        navigation: 'auto',
        enableAutoSave: true,
      },
      pages: [createPage()],
    };
    return await this.repository.saveForm(user.id, form);
  }

  /** Appends a new page to the stored form and returns it. */
  async addPage({ form, ownerId }: OwnedForm, title: string): Promise<PageDefinition> {
    const page = createPage(title);
    await this.repository.saveForm(ownerId, { ...form, pages: [...form.pages, page] });
    return page;
  }

  async deletePage({ form, ownerId }: OwnedForm, pageId: string): Promise<void> {
    await this.repository.saveForm(ownerId, {
      ...form,
      pages: form.pages.filter((p) => p.id !== pageId),
    });
  }
  /** Inserts a new element into a page or group of the stored form and returns it. */
  async addElement(
    { form, ownerId }: OwnedForm,
    { type, label, parentId, afterId = null }: CreateElementRequest,
  ): Promise<ElementDefinition> {
    const element = createElement(type, label);
    const pages = insertIntoParent(form.pages, parentId, afterId, element);
    if (!pages) {
      throw new NotFoundException({
        error: afterId
          ? `no element ${afterId} in page or group ${parentId}`
          : `no page or group with id: ${parentId}`,
      });
    }
    await this.repository.saveForm(ownerId, { ...form, pages });
    return element;
  }
  async deleteElement({ form, ownerId }: OwnedForm, elementId: string): Promise<void> {
    const remove = (els: ElementDefinition[]): ElementDefinition[] =>
      els
        .filter((e) => e.id !== elementId)
        .map((e) => (e.type === 'group' ? { ...e, elements: remove(e.elements) } : e));

    await this.repository.saveForm(ownerId, {
      ...form,
      pages: form.pages.map((p) => ({ ...p, elements: remove(p.elements) })),
    });
  }
  async addSubmission(submission: SubmissionCreate) {
    const form = await this.getForm(submission.formId);
    if (!form?.form) throw new NotFoundException({ error: 'not found' });

    const saved = {
      ...submission,
      id: elementId('submission'),
      formVersion: FORM_VERSION,
      formName: form.form.name,
      submittedAt: new Date().toISOString(),
    };

    const values = submission.values;
    const seen: string[] = [];

    const validateIfVisible = (e: ElementDefinition, parentVisible: boolean) => {
      if (!isQuestionOrGroup(e)) return;

      const visible = parentVisible && evalConditionGroup(e.enabledWhen, values);
      if (e.type === 'group') {
        for (const child of childrenOf(form.form, e)) validateIfVisible(child, visible);
        return;
      }
      const value = values[e.id];
      if (visible) {
        if (value !== undefined) {
          seen.push(e.id);
        }

        const validation = validateElementValue(e, value, values);
        if (!validation.valid) {
          throw new BadRequestException({
            error: `value for field ${e.id} is invalid: ${validation.failures.map((x) => x.message).join(', ')}`,
          });
        }
      } else if (value !== undefined)
        throw new BadRequestException({
          error: `submission contains value for invisible element: ${e.id}`,
        });
    };
    for (const page of form.form.pages) {
      const visible = evalConditionGroup(page.enabledWhen, values);
      for (const el of childrenOf(form.form, page)) validateIfVisible(el, visible);
    }
    const unknown = Object.keys(values).find((valueId) => !seen.includes(valueId));

    if (unknown) {
      throw new BadRequestException({
        error: `submission contains value for non-existent element: ${unknown}`,
      });
    }

    await this.repository.addSubmission(saved);
    return saved;
  }
}
