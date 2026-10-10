import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FORM_VERSION } from '@shared/consts';
import { evalConditionGroup, validateElementValue } from '@shared/engine';
import { has, isQuestionOrGroup } from '@shared/helper';
import {
  type ElementDefinition,
  elementId,
  emptyConditionGroup,
  type FormDefinition,
  type PageDefinition,
  type SubmissionCreate,
  uuid,
} from '@shared/model';
import { Repository, type User } from '../repository';

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
      schemaVersion: 1,
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

    for (const page of form.form.pages) {
      const validateIfVisible = (e: ElementDefinition | PageDefinition, parentVisible = true) => {
        if (has(e, 'type') && !isQuestionOrGroup(e)) return;

        const visible = evalConditionGroup(e.enabledWhen, values);
        if (has(e, 'elements')) {
          for (const child of e.elements) {
            validateIfVisible(child, parentVisible && visible);
          }
        } else {
          const value = values[e.id];
          if (parentVisible && visible) {
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
        }
      };
      validateIfVisible(page);
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
function createPage(title = 'New page'): PageDefinition {
  return {
    id: elementId('page'),
    title,
    subtitle: '',
    elements: [],
    enabledWhen: emptyConditionGroup(),
  };
}
