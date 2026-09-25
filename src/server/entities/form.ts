import { EntitySchema } from 'typeorm';
import type { UserEntityModel } from './user';

export interface FormEntityModel {
  id: string;
  ownerId: string;
  owner?: UserEntityModel | null;
  document: string;
  createdAt: string;
  updatedAt: string;
}
export interface SubmissionEntityModel {
  id: string;
  formId: string;
  document: string;
  submittedAt: string;
  form?: FormEntityModel;
}

export const SubmissionEntity = new EntitySchema<SubmissionEntityModel>({
  name: 'Submission',
  tableName: 'submissions',
  columns: {
    id: { type: String, primary: true },
    formId: { name: 'form_id', type: String },
    document: { type: 'text' },
    submittedAt: { name: 'submitted_at', type: String },
  },
  indices: [{ columns: ['formId', 'submittedAt'] }],
  relations: {
    form: {
      type: 'many-to-one',
      target: 'Form',
      joinColumn: { name: 'form_id' },
      onDelete: 'CASCADE',
    },
  },
});

export const FormEntity = new EntitySchema<FormEntityModel>({
  name: 'Form',
  tableName: 'forms',
  columns: {
    id: { type: String, primary: true },
    ownerId: { name: 'owner_id', type: String },
    document: { type: 'text' },
    createdAt: { name: 'created_at', type: String },
    updatedAt: { name: 'updated_at', type: String },
  },
  indices: [{ columns: ['ownerId', 'updatedAt'] }],
  relations: {
    owner: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: { name: 'owner_id' },
      onDelete: 'CASCADE',
    },
  },
});
