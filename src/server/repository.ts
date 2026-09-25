import type { DataSource } from 'typeorm';

import {
  toPortableForm,
  type FormDefinition,
  type FormWithOwner,
} from '../shared/model/form.model.js';
import { formDefinitionSchema, stripFormOwnership } from '../shared/model/model-validator.js';
import type { Submission } from '../shared/model/submission.model.js';
import type { PublicUser, UserRole } from '../shared/model/user.model.js';
import { FormEntity, SubmissionEntity, type FormEntityModel } from './entities/form.js';
import { SessionEntity, UserEntity, type UserEntityModel } from './entities/user.js';
import { submissionSchema } from './schemas.js';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

export class Repository {
  constructor(private readonly source: DataSource) {}

  async users(): Promise<User[]> {
    const rows = await this.source.getRepository(UserEntity).find({ order: { email: 'ASC' } });
    return rows.map(toUser);
  }

  async userByEmail(email: string): Promise<User | null> {
    const row = await this.source.getRepository(UserEntity).findOneBy({ email });
    return row ? toUser(row) : null;
  }

  async userById(id: string): Promise<User | null> {
    const row = await this.source.getRepository(UserEntity).findOneBy({ id });
    return row ? toUser(row) : null;
  }

  async userBySession(tokenHash: string): Promise<User | null> {
    const session = await this.source.getRepository(SessionEntity).findOneBy({ tokenHash });
    if (!session || session.expiresAt <= new Date().toISOString()) return null;
    const user = await this.source.getRepository(UserEntity).findOneBy({ id: session.userId });
    return user ? toUser(user) : null;
  }

  async createUser(user: User): Promise<void> {
    await this.source.getRepository(UserEntity).insert(user);
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<boolean> {
    return (
      (await this.source.getRepository(UserEntity).update(id, { passwordHash })).affected === 1
    );
  }

  async updateUserEmail(id: string, email: string): Promise<boolean> {
    return (await this.source.getRepository(UserEntity).update(id, { email })).affected === 1;
  }

  async deleteUser(id: string): Promise<boolean> {
    return (await this.source.getRepository(UserEntity).delete(id)).affected === 1;
  }

  /** Remove a user together with their forms, submissions and sessions. */
  async deleteUserWithData(id: string): Promise<void> {
    const forms = await this.source.getRepository(FormEntity).findBy({ ownerId: id });
    for (const form of forms) {
      await this.source.getRepository(SubmissionEntity).delete({ formId: form.id });
    }
    this.source.transaction(async (em) => {
      await em.getRepository(FormEntity).delete({ ownerId: id });
      await em.getRepository(SessionEntity).delete({ userId: id });
      await em.getRepository(UserEntity).delete({ id });
    });
  }

  async createSession(tokenHash: string, userId: string, expiresAt: string): Promise<void> {
    await this.source.getRepository(SessionEntity).insert({
      tokenHash,
      userId,
      expiresAt,
      createdAt: new Date().toISOString(),
    });
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.source.getRepository(SessionEntity).delete(tokenHash);
  }

  async pruneSessions(): Promise<void> {
    await this.source
      .getRepository(SessionEntity)
      .createQueryBuilder()
      .delete()
      .where('expires_at <= :now', { now: new Date().toISOString() })
      .execute();
  }

  async clearUsersSessions(userid: string, exceptTokenHash?: string) {
    const query = this.source
      .getRepository(SessionEntity)
      .createQueryBuilder()
      .delete()
      .where('user_id = :userid', { userid });

    if (exceptTokenHash !== undefined) {
      query.andWhere('token_hash != :tokenHash', { tokenHash: exceptTokenHash });
    }

    await query.execute();
  }

  async forms(ownerId: string): Promise<FormWithOwner[]> {
    const rows = await this.source.getRepository(FormEntity).find({
      where: { ownerId },
      order: { updatedAt: 'DESC' },
      relations: { owner: true },
    });

    return rows.map(toFormWithOwner);
  }

  async allForms(): Promise<FormWithOwner[]> {
    const rows = await this.source.getRepository(FormEntity).find({
      order: { updatedAt: 'DESC' },
      relations: { owner: true },
    });
    return rows.map(toFormWithOwner);
  }

  async formCount(): Promise<number> {
    return this.source.getRepository(FormEntity).count();
  }

  async form(id: string): Promise<{ form: FormDefinition; ownerId: string } | null> {
    const row = await this.source.getRepository(FormEntity).findOneBy({ id });
    if (!row?.document) return null;
    const form = toPortableForm(
      formDefinitionSchema.parse(stripFormOwnership(JSON.parse(row.document))),
    );

    return { form, ownerId: row.ownerId };
  }

  async ownedForm(id: string): Promise<FormWithOwner | null> {
    const row = await this.source.getRepository(FormEntity).findOne({
      where: { id },
      relations: { owner: true },
    });
    if (!row?.document) return null;
    return toFormWithOwner(row);
  }

  async saveForm(ownerId: string, form: FormDefinition): Promise<FormWithOwner> {
    const existing = await this.form(form.id);
    const now = new Date().toISOString();
    const saved: FormDefinition = {
      ...toPortableForm(form),
      ownerId,
      createdAt: existing?.form.createdAt ?? form.createdAt ?? now,
      updatedAt: now,
    };
    await this.source.getRepository(FormEntity).save({
      id: form.id,
      ownerId,
      document: JSON.stringify(saved),
      createdAt: saved.createdAt ?? now,
      updatedAt: now,
    });
    const owned = await this.ownedForm(form.id);
    if (!owned) throw new Error('form was not saved');
    return owned;
  }

  async deleteForm(id: string): Promise<boolean> {
    return (await this.source.getRepository(FormEntity).delete(id)).affected === 1;
  }

  async submissions(formId: string): Promise<Submission[]> {
    const rows = await this.source.getRepository(SubmissionEntity).find({
      where: { formId },
      order: { submittedAt: 'DESC' },
    });

    return rows.map((row) => submissionSchema.parse(JSON.parse(row.document))).filter((v) => v);
  }

  async addSubmission(submission: Submission): Promise<void> {
    await this.source.getRepository(SubmissionEntity).insert({
      id: submission.id,
      formId: submission.formId,
      document: JSON.stringify(submission),
      submittedAt: submission.submittedAt,
    });
  }

  async clearSubmissions(formId: string): Promise<void> {
    await this.source.getRepository(SubmissionEntity).delete({ formId });
  }

  async deleteSubmission(formId: string, submissionId: string): Promise<boolean> {
    return (
      (await this.source.getRepository(SubmissionEntity).delete({ id: submissionId, formId }))
        .affected === 1
    );
  }
}

function toUser(row: UserEntityModel): User {
  return row;
}

function toPublicUser(row: UserEntityModel): PublicUser {
  const { id, email, role, createdAt } = row;
  return { id, email, role, createdAt };
}

function toFormWithOwner(row: FormEntityModel): FormWithOwner {
  const form = toPortableForm(
    formDefinitionSchema.parse(stripFormOwnership(JSON.parse(row.document))),
  );
  return {
    ...form,
    ownerId: row.ownerId,
    owner: row.owner ? toPublicUser(row.owner) : null,
  };
}
