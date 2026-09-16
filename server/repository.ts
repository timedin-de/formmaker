import type { FormDefinition } from '../src/app/shared/model/form.model.ts';
import type { Submission } from '../src/app/shared/model/submission.model.ts';
import type { DataSource } from 'typeorm';
import { FormEntity, type FormEntityModel, SubmissionEntity } from './entities/form.ts';
import { SessionEntity, UserEntity, type UserEntityModel } from './entities/user.ts';
import { formDefinitionSchema } from '../src/app/shared/model/model-validator.ts';
import { submissionSchema } from './schemas.ts';

export type UserRole = 'admin' | 'editor';
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

  async deleteUser(id: string): Promise<boolean> {
    return (await this.source.getRepository(UserEntity).delete(id)).affected === 1;
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

  async forms(ownerId: string): Promise<FormDefinition[]> {
    const rows = await this.source.getRepository(FormEntity).find({
      where: { ownerId },
      order: { updatedAt: 'DESC' },
    });
    return rows.map((row) => formDefinitionSchema.parse(JSON.parse(row.document)));
  }

  async allForms(): Promise<FormDefinition[]> {
    const rows = await this.source.getRepository(FormEntity).find({ order: { updatedAt: 'DESC' } });
    return rows.map((row) => formDefinitionSchema.parse(JSON.parse(row.document)));
  }

  async formCount(): Promise<number> {
    return this.source.getRepository(FormEntity).count();
  }

  async form(id: string): Promise<{ form: FormDefinition; ownerId: string } | null> {
    const row = await this.source.getRepository(FormEntity).findOneBy({ id });
    if (!row?.document) return null;
    const form = formDefinitionSchema.parse(JSON.parse(row.document));

    return { form, ownerId: row.ownerId };
  }

  async saveForm(ownerId: string, form: FormDefinition): Promise<FormDefinition> {
    const existing = await this.form(form.id);
    const now = new Date().toISOString();
    const saved: FormDefinition = {
      ...form,
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
    return saved;
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

export type { FormEntityModel };
