import { type FormDefinition, uuid } from '@shared/model';
import { createPage } from '../../src/frontend/app/core/state/form-factory';

export function newForm(name = 'Untitled form'): FormDefinition {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    name,
    description: '',
    version: 1,
    schemaVersion: 1,
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
  };
}
