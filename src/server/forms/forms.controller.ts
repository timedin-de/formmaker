import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { type FormDefinition, type SubmissionCreate, toPortableForm, uuid } from '@shared/model';
import { formDefinitionSchema, stripFormOwnership, submissionCreateSchema } from '@shared/schemas';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Repository, type User } from '../repository';
import { FormService } from './form.service';

/** Strips client-supplied ownership fields before validating the form schema. */
class FormBodyPipe extends ZodValidationPipe<FormDefinition> {
  constructor() {
    super(formDefinitionSchema as never);
  }

  override transform(value: unknown): FormDefinition {
    return super.transform(stripFormOwnership(value));
  }
}

function canManage(ownerId: string, user: User): boolean {
  return user.role === 'admin' || user.id === ownerId;
}

@Controller('forms')
export class FormsController {
  constructor(
    @Inject(Repository) private readonly repository: Repository,
    @Inject(FormService) private readonly formService: FormService,
  ) {}

  /** Loads a form the user may manage, or throws 404 / 403. */
  private async managedForm(id: string, user: User) {
    const item = await this.repository.form(id);
    if (!item) throw new NotFoundException({ error: 'not found' });
    if (!canManage(item.ownerId, user)) throw new ForbiddenException({ error: 'not form owner' });
    return item;
  }

  @Get()
  @UseGuards(AuthGuard)
  getForms(@CurrentUser() user: User) {
    return user.role === 'admin' ? this.repository.allForms() : this.repository.forms(user.id);
  }

  // Public by id: existing share links stay usable without revealing the form catalogue.
  @Get(':id')
  async getFormById(@Param('id') id: string) {
    const item = await this.repository.form(id);
    if (!item) throw new NotFoundException({ error: 'not found' });
    return toPortableForm(item.form);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(AuthGuard)
  createForm(@CurrentUser() user: User, @Body(new FormBodyPipe()) form: FormDefinition) {
    form.id = uuid();
    return this.repository.saveForm(user.id, form);
  }

  @Put()
  @UseGuards(AuthGuard)
  async saveForm(
    @CurrentUser() user: User,
    @Body(new FormBodyPipe()) form: FormDefinition,
    @Res({ passthrough: true }) res: Response,
  ) {
    const existing = await this.repository.form(form.id);
    if (existing && !canManage(existing.ownerId, user))
      throw new ForbiddenException({ error: 'not form owner' });
    res.status(existing ? 200 : 201);
    return this.repository.saveForm(existing?.ownerId ?? user.id, form);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async deleteForm(@CurrentUser() user: User, @Param('id') id: string) {
    const item = await this.managedForm(id, user);
    await this.repository.deleteForm(item.form.id);
  }

  @Get(':id/submissions')
  @UseGuards(AuthGuard)
  async getSubmissions(@CurrentUser() user: User, @Param('id') id: string) {
    const item = await this.managedForm(id, user);
    return this.repository.submissions(item.form.id);
  }

  @Post(':id/submissions')
  @HttpCode(201)
  async addSubmission(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(submissionCreateSchema)) submission: SubmissionCreate,
  ) {
    if (submission.formId !== id)
      throw new UnprocessableEntityException({ error: 'submission must match the form id' });

    return await this.formService.addSubmission(submission);
  }

  @Delete(':id/submissions')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async clearSubmissions(@CurrentUser() user: User, @Param('id') id: string) {
    const item = await this.managedForm(id, user);
    await this.repository.clearSubmissions(item.form.id);
  }

  @Delete(':id/submissions/:submissionId')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async deleteSubmission(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
  ) {
    const item = await this.managedForm(id, user);
    if (!(await this.repository.deleteSubmission(item.form.id, submissionId)))
      throw new NotFoundException({ error: 'not found' });
  }
}
