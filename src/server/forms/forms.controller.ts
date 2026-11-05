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
  Patch,
  Post,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  type SaveFormDefinition,
  type SubmissionCreate,
  toPortableForm,
  uuid,
} from '@shared/model';
import {
  type CreateElementRequest,
  createElementSchema,
  type CreateOptionRequest,
  createOptionSchema,
  createPageSchema,
  formDefinitionSchema,
  saveFormDefinitionSchema,
  stripFormOwnership,
  submissionCreateSchema,
  type UpdateOptionRequest,
  updateOptionSchema,
} from '@shared/schemas';
import * as z from 'zod/mini';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Repository, type User } from '../repository';
import { FormService } from './form.service';
import { type FormDefinition } from './forms.model';

class SaveFormBodyPipe extends ZodValidationPipe<SaveFormDefinition> {
  constructor() {
    super(saveFormDefinitionSchema);
  }

  override transform(value: unknown): SaveFormDefinition {
    return super.transform(stripFormOwnership(value));
  }
}
class OptionalFormBodyPipe extends ZodValidationPipe<FormDefinition | undefined> {
  constructor() {
    super(z.optional(formDefinitionSchema));
  }

  override transform(value: unknown) {
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

  @Post()
  @HttpCode(201)
  @UseGuards(AuthGuard)
  async createForm(
    @CurrentUser() user: User,
    @Body(new OptionalFormBodyPipe()) body: FormDefinition,
  ) {
    if (body) {
      body.id = uuid();
      return this.repository.saveForm(user.id, body);
    }
    const form = await this.formService.newForm(user);
    return form;
  }

  // Public by id: existing share links stay usable without revealing the form catalogue.
  @Get(':id')
  async getFormById(@Param('id') id: string) {
    const item = await this.repository.form(id);
    if (!item) throw new NotFoundException({ error: 'not found' });
    return toPortableForm(item.form);
  }

  @Put(':id')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async saveForm(
    @CurrentUser() user: User,
    @Body(new SaveFormBodyPipe()) form: SaveFormDefinition,
    @Param('id') id: string,
  ) {
    if (form.id !== id)
      throw new UnprocessableEntityException({ error: 'form id must match the path id' });
    const existing = await this.repository.form(id);
    if (!existing) throw new NotFoundException({ error: `form with id: ${id} doesnt not exist` });
    if (!canManage(existing.ownerId, user))
      throw new ForbiddenException({ error: 'not form owner of form' });
    return this.repository.saveForm(existing?.ownerId ?? user.id, { ...existing.form, ...form });
  }

  @Post(':id/pages')
  @HttpCode(201)
  @UseGuards(AuthGuard)
  async addPage(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createPageSchema)) body: z.infer<typeof createPageSchema>,
  ) {
    const item = await this.managedForm(id, user);
    return this.formService.addPage(item, body.title);
  }

  @Delete(':formId/pages/:pageId')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async deletePage(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('pageId') pageId: string,
  ) {
    const item = await this.managedForm(formId, user);
    return this.formService.deletePage(item, pageId);
  }

  @Post(':id/elements')
  @HttpCode(201)
  @UseGuards(AuthGuard)
  async addElement(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createElementSchema)) body: CreateElementRequest,
  ) {
    const item = await this.managedForm(id, user);
    return this.formService.addElement(item, body);
  }

  @Delete(':formId/elements/:elementId')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async deleteElement(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
  ) {
    const item = await this.managedForm(formId, user);
    return this.formService.deleteElement(item, elementId);
  }

  @Post(':formId/elements/:elementId/options')
  @HttpCode(201)
  @UseGuards(AuthGuard)
  async addOption(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Body(new ZodValidationPipe(createOptionSchema)) body: CreateOptionRequest,
  ) {
    const item = await this.managedForm(formId, user);
    return this.formService.addOption(item, elementId, body);
  }

  @Patch(':formId/elements/:elementId/options/:optionId')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async updateOption(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Param('optionId') optionId: string,
    @Body(new ZodValidationPipe(updateOptionSchema)) body: UpdateOptionRequest,
  ) {
    const item = await this.managedForm(formId, user);
    return this.formService.updateOption(item, elementId, optionId, body);
  }

  @Delete(':formId/elements/:elementId/options/:optionId')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async deleteOption(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Param('optionId') optionId: string,
  ) {
    const item = await this.managedForm(formId, user);
    await this.formService.deleteOption(item, elementId, optionId);
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
