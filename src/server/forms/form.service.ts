import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FORM_VERSION } from '@shared/consts';
import { evalConditionGroup, validateElementValue } from '@shared/engine';
import { compileRegex } from '@shared/engine/regex';
import { isChoice, isQuestion, isQuestionOrGroup } from '@shared/helper';
import {
  addPage,
  childrenOf,
  type ChoiceElement,
  type ChoiceOption,
  cloneElement as cloneElementTree,
  clonePage as clonePageTree,
  createElement,
  createPage,
  type ElementClone,
  type ElementDefinition,
  elementId,
  FORM_SCHEMA_VERSION,
  type FormDefinition,
  getElement,
  getParent,
  insertElement,
  moveElementTo,
  type PageClone,
  patchElement,
  type PageDefinition,
  parentOf,
  type QuestionDefinition,
  removeElement,
  removePage,
  REPEATABLE_RULES,
  type SubmissionCreate,
  subtreeIds,
  updateElement,
  uuid,
  type ValidationRule,
  type ValidationRuleType,
  ValidationsByQuestionType,
} from '@shared/model';
import {
  type CloneRequest,
  type CreateElementRequest,
  type CreateOptionRequest,
  type CreateValidationRuleRequest,
  elementDefinitionSchema,
  type MoveElementRequest,
  type UpdateElementRequest,
  type UpdateOptionRequest,
  type UpdateValidationRuleRequest,
} from '@shared/schemas';
import { Repository, type User } from '../repository';

/** A stored form together with its owner, as loaded by `Repository.form`. */
export interface OwnedForm {
  form: FormDefinition;
  ownerId: string;
}

/**
 * The element `id` if it passes `guard`; throws 404 when there is none and 400 with
 * "element <id> has <lacks>" when it is of the wrong kind.
 */
function elementOf<T extends ElementDefinition>(
  form: FormDefinition,
  id: string,
  guard: (element: ElementDefinition) => element is T,
  lacks: string,
): T {
  const element = getElement(form, id);
  if (!element) throw new NotFoundException({ error: `no element with id: ${id}` });
  if (!guard(element)) throw new BadRequestException({ error: `element ${id} has ${lacks}` });
  return element;
}

/** The question `id`, or throws 404 / 400. */
function questionElement(form: FormDefinition, id: string): QuestionDefinition {
  return elementOf(form, id, isQuestion, 'no validations');
}

/** The validation rule `id` of `element`, or throws 404. */
function validationRule(element: QuestionDefinition, id: string): ValidationRule {
  const rule = element.validations?.find((r) => r.id === id);
  if (!rule) throw new NotFoundException({ error: `no rule ${id} in element ${element.id}` });
  return rule;
}

/** Rules whose `value` (and `valueTo` for `between`) is a number bound. */
const NUMERIC_RULES: readonly ValidationRuleType[] = [
  'minLength',
  'maxLength',
  'minCount',
  'maxCount',
  'min',
  'max',
  'between',
  'minFiles',
  'maxFiles',
  'fileSizeMaxMb',
];

/** Unset, empty, or a number (numeric strings included, as the engine reads them). */
function isNumberBound(value: unknown): boolean {
  if (value === undefined || value === '') return true;
  return (typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value));
}

/** Throws 400 when the fields of `rule` don't fit its type, e.g. a bad regex or bound. */
function assertRuleFields(rule: ValidationRule): void {
  const fail = (field: string) => {
    throw new BadRequestException({ error: `invalid ${field} for rule ${rule.rule}` });
  };
  if (NUMERIC_RULES.includes(rule.rule)) {
    if (!isNumberBound(rule.value)) fail('value');
    if (rule.rule === 'between' && !isNumberBound(rule.valueTo)) fail('valueTo');
  }
  if (rule.rule === 'pattern' && rule.pattern) {
    try {
      compileRegex(rule.pattern);
    } catch {
      fail('pattern');
    }
  }
}

/** The choice, dropdown or multi choice element `id`, or throws 404 / 400. */
function choiceElement(form: FormDefinition, id: string): ChoiceElement {
  return elementOf(form, id, isChoice, 'no options');
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

  /** Creates an empty form with one page titled `pageTitle` (localized by the client). */
  async newForm(user: User, pageTitle?: string) {
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
      pages: [createPage(pageTitle)],
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

  /** Clones a page with all of its elements and appends it to the stored form. */
  async clonePage(
    { form, ownerId }: OwnedForm,
    pageId: string,
    { suffix }: CloneRequest,
  ): Promise<PageClone> {
    const clone = clonePageTree(form, pageId, suffix);
    if (!clone) throw new NotFoundException({ error: `no page with id: ${pageId}` });
    await this.repository.saveForm(ownerId, addPage(form, clone.page, clone.elements));
    return clone;
  }

  /** Removes a page and all of its elements from the stored form. */
  async deletePage({ form, ownerId }: OwnedForm, pageId: string): Promise<void> {
    await this.repository.saveForm(ownerId, removePage(form, pageId));
  }

  /** Inserts a new element into a page or group of the stored form and returns it. */
  async addElement(
    { form, ownerId }: OwnedForm,
    { type, label, parentId, afterId = null, defaults }: CreateElementRequest,
  ): Promise<ElementDefinition> {
    const element = createElement(type, label, defaults);
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

  /**
   * Clones an element and everything below it right after the original in the
   * stored form, and returns the copy.
   */
  async cloneElement(
    { form, ownerId }: OwnedForm,
    id: string,
    { suffix }: CloneRequest,
  ): Promise<ElementClone> {
    const clone = cloneElementTree(form, id, suffix);
    const parent = parentOf(form, id);
    if (!clone || !parent) throw new NotFoundException({ error: `no element with id: ${id}` });

    const next = insertElement(form, parent.id, id, clone.element, clone.subtree);
    if (!next) throw new NotFoundException({ error: `element ${id} is not on any page` });
    await this.repository.saveForm(ownerId, next);
    return clone;
  }

  /**
   * Moves an element with everything below it to `index` of the page or group
   * `parentId`; `index` counts after detaching it and is clamped. Throws 404 for an
   * unknown element or parent and 400 when the parent lies inside the moved element.
   */
  async moveElement(
    { form, ownerId }: OwnedForm,
    id: string,
    { parentId, index }: MoveElementRequest,
  ): Promise<void> {
    if (!getElement(form, id)) throw new NotFoundException({ error: `no element with id: ${id}` });
    if (!getParent(form, parentId))
      throw new NotFoundException({ error: `no page or group with id: ${parentId}` });
    if (subtreeIds(form, id).includes(parentId))
      throw new BadRequestException({ error: `cannot move element ${id} into itself` });

    const next = moveElementTo(form, id, parentId, index);
    if (!next) throw new NotFoundException({ error: `element ${id} is not on any page` });
    await this.repository.saveForm(ownerId, next);
  }

  /**
   * Applies `patch` to an element (see `patchElement`) and returns the element as
   * stored. Throws 404 for an unknown element and 400 when the patched element is
   * invalid, e.g. a field its type lacks or a scale without `min`.
   */
  async updateElement(
    { form, ownerId }: OwnedForm,
    id: string,
    patch: UpdateElementRequest,
  ): Promise<ElementDefinition> {
    if (!getElement(form, id)) throw new NotFoundException({ error: `no element with id: ${id}` });
    const next = patchElement(form, id, patch);
    const parsed = elementDefinitionSchema.safeParse(next.elements[id]);
    if (!parsed.success) {
      throw new BadRequestException({
        error: `invalid patch for element ${id}`,
        details: parsed.error.issues,
      });
    }
    await this.repository.saveForm(ownerId, {
      ...next,
      elements: { ...next.elements, [id]: parsed.data },
    });
    return parsed.data;
  }

  /** Removes an element and everything below it from the stored form. */
  async deleteElement({ form, ownerId }: OwnedForm, elementId: string): Promise<void> {
    await this.repository.saveForm(ownerId, removeElement(form, elementId));
  }

  /**
   * Appends an option to a choice, dropdown or multi choice element and returns it.
   */
  async addOption(
    { form, ownerId }: OwnedForm,
    elementId: string,
    { label }: CreateOptionRequest,
  ): Promise<ChoiceOption> {
    const element = choiceElement(form, elementId);
    const option: ChoiceOption = { id: uuid(), label };
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

  /**
   * Appends a validation rule to a question and returns it. Throws 404 for an unknown
   * element and 400 for a non-question, a rule its type doesn't offer, or a second copy
   * of a rule that can't repeat.
   */
  async addValidationRule(
    { form, ownerId }: OwnedForm,
    elementId: string,
    { rule, message }: CreateValidationRuleRequest,
  ): Promise<ValidationRule> {
    const element = questionElement(form, elementId);
    if (!ValidationsByQuestionType[element.type].includes(rule))
      throw new BadRequestException({ error: `rule ${rule} is not offered for ${element.type}` });
    const validations = element.validations ?? [];
    if (!REPEATABLE_RULES.includes(rule) && validations.some((r) => r.rule === rule))
      throw new BadRequestException({ error: `element ${elementId} already has rule ${rule}` });

    const created: ValidationRule = { id: uuid(), rule, message };
    await this.repository.saveForm(
      ownerId,
      updateElement(form, elementId, { validations: [...validations, created] }),
    );
    return created;
  }

  /**
   * Merges `patch` into a validation rule of a question and returns the updated rule.
   * Throws 404 for an unknown element or rule and 400 for a non-question or a merged
   * rule whose fields don't fit its type (an invalid regex, a non-numeric bound).
   */
  async updateValidationRule(
    { form, ownerId }: OwnedForm,
    elementId: string,
    ruleId: string,
    patch: UpdateValidationRuleRequest,
  ): Promise<ValidationRule> {
    const element = questionElement(form, elementId);
    const current = validationRule(element, ruleId);

    const rule: ValidationRule = { ...current, ...patch };
    assertRuleFields(rule);
    const validations = (element.validations ?? []).map((r) => (r === current ? rule : r));
    await this.repository.saveForm(ownerId, updateElement(form, elementId, { validations }));
    return rule;
  }

  /** Removes a validation rule from a question; 404 / 400 as `updateValidationRule`. */
  async deleteValidationRule(
    { form, ownerId }: OwnedForm,
    elementId: string,
    ruleId: string,
  ): Promise<void> {
    const element = questionElement(form, elementId);
    const current = validationRule(element, ruleId);
    const validations = (element.validations ?? []).filter((r) => r !== current);
    await this.repository.saveForm(ownerId, updateElement(form, elementId, { validations }));
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
