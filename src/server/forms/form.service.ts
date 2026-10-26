import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FORM_VERSION } from '@shared/consts';
import { evalConditionGroup, validateElementValue } from '@shared/engine';
import { isQuestionOrGroup } from '@shared/helper';
import {
  addPage,
  type ChoiceElement,
  type ChoiceOption,
  childrenOf,
  createElement,
  createPage,
  type ElementDefinition,
  elementId,
  FORM_SCHEMA_VERSION,
  type FormDefinition,
  getElement,
  insertElement,
  type PageDefinition,
  removeElement,
  removePage,
  type SubmissionCreate,
  updateElement,
  uuid,
} from '@shared/model';
import {
  type CreateElementRequest,
  type CreateOptionRequest,
  type UpdateOptionRequest,
} from '@shared/schemas';
import { Repository, type User } from '../repository';

/** A stored form together with its owner, as loaded by `Repository.form`. */
interface OwnedForm {
  form: FormDefinition;
  ownerId: string;
}

/** The choice, dropdown or multi choice element `id`, or throws 404 / 400. */
function choiceElement(form: FormDefinition, id: string): ChoiceElement {
  const element = getElement(form, id);
  if (!element) throw new NotFoundException({ error: `no element with id: ${id}` });
  if (element.type !== 'choice' && element.type !== 'dropdown' && element.type !== 'multiChoice')
    throw new BadRequestException({ error: `element ${id} has no options` });
  return element;
}

/** The option `id` of `element`, or throws 404. */
function choiceOption(element: ChoiceElement, id: string): ChoiceOption {
  const option = element.options.find((o) => o.id === id);
  if (!option) throw new NotFoundException({ error: `no option ${id} in element ${element.id}` });
  return option;
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
      elements: {},
    };
    return await this.repository.saveForm(user.id, form);
  }

  /** Appends a new page to the stored form and returns it. */
  async addPage({ form, ownerId }: OwnedForm, title: string): Promise<PageDefinition> {
    const page = createPage(title);
    await this.repository.saveForm(ownerId, addPage(form, page));
    return page;
  }

  /** Removes a page and all of its elements from the stored form. */
  async deletePage({ form, ownerId }: OwnedForm, pageId: string): Promise<void> {
    await this.repository.saveForm(ownerId, removePage(form, pageId));
  }

  /** Inserts a new element into a page or group of the stored form and returns it. */
  async addElement(
    { form, ownerId }: OwnedForm,
    { type, label, parentId, afterId = null }: CreateElementRequest,
  ): Promise<ElementDefinition> {
    const element = createElement(type, label);
    const next = insertElement(form, parentId, afterId, element);
    if (!next) {
      throw new NotFoundException({
        error: afterId
          ? `no element ${afterId} in page or group ${parentId}`
          : `no page or group with id: ${parentId}`,
      });
    }
    await this.repository.saveForm(ownerId, next);
    return element;
  }

  /** Removes an element and everything below it from the stored form. */
  async deleteElement({ form, ownerId }: OwnedForm, elementId: string): Promise<void> {
    await this.repository.saveForm(ownerId, removeElement(form, elementId));
  }

  /**
   * Appends an option to a choice, dropdown or multi choice element and returns it.
   * Without a value the next free `option_<n>` is used.
   */
  async addOption(
    { form, ownerId }: OwnedForm,
    elementId: string,
    { label, value }: CreateOptionRequest,
  ): Promise<ChoiceOption> {
    const element = choiceElement(form, elementId);
    const taken = new Set(element.options.map((o) => String(o.value)));
    if (value !== undefined && taken.has(String(value)))
      throw new ConflictException({ error: `option value ${value} already exists` });
    let n = element.options.length + 1;
    while (value === undefined && taken.has(`option_${n}`)) n++;

    const option: ChoiceOption = { id: uuid(), label, value: value ?? `option_${n}` };
    await this.repository.saveForm(
      ownerId,
      updateElement(form, elementId, { options: [...element.options, option] }),
    );
    return option;
  }

  /** Merges `patch` into an option of a choice element and returns the updated option. */
  async updateOption(
    { form, ownerId }: OwnedForm,
    elementId: string,
    optionId: string,
    patch: UpdateOptionRequest,
  ): Promise<ChoiceOption> {
    const element = choiceElement(form, elementId);
    const current = choiceOption(element, optionId);
    const { value } = patch;
    if (
      value !== undefined &&
      element.options.some((o) => o !== current && String(o.value) === String(value))
    )
      throw new ConflictException({ error: `option value ${value} already exists` });

    const option: ChoiceOption = { ...current, ...patch };
    const options = element.options.map((o) => (o === current ? option : o));
    await this.repository.saveForm(ownerId, updateElement(form, elementId, { options }));
    return option;
  }

  /** Removes an option from a choice element. */
  async deleteOption({ form, ownerId }: OwnedForm, elementId: string, optionId: string) {
    const element = choiceElement(form, elementId);
    const current = choiceOption(element, optionId);
    const options = element.options.filter((o) => o !== current);
    await this.repository.saveForm(ownerId, updateElement(form, elementId, { options }));
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
