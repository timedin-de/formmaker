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
  formDefinitionSchema,
  type NewFormRequest,
  newFormSchema,
  saveFormDefinitionSchema,
  stripFormOwnership,
  submissionCreateSchema,
} from '@shared/schemas';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Repository, type User } from '../repository';
import { FormService } from './form.service';
import { type FormDefinition } from './forms.model';
import { canManage, managedForm } from './managed-form';

class SaveFormBodyPipe extends ZodValidationPipe<SaveFormDefinition> {
  constructor() {
    super(saveFormDefinitionSchema);
  }

  override transform(value: unknown): SaveFormDefinition {
    return super.transform(stripFormOwnership(value));
  }
}
class ImportFormBodyPipe extends ZodValidationPipe<FormDefinition> {
  constructor() {
    super(formDefinitionSchema);
  }

  override transform(value: unknown) {
    return super.transform(stripFormOwnership(value));
  }
}

@Controller('forms')
export class FormsController {
  constructor(
    @Inject(Repository) private readonly repository: Repository,
    @Inject(FormService) private readonly formService: FormService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  getForms(@CurrentUser() user: User) {
    return user.role === 'admin' ? this.repository.allForms() : this.repository.forms(user.id);
  }

  /** Creates a new empty form with one page. */
  @Post()
  @HttpCode(201)
  @UseGuards(AuthGuard)
  async createForm(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(newFormSchema)) body: NewFormRequest,
  ) {
    return this.formService.newForm(user, body.pageTitle);
  }

  /** Imports a full form definition as a new form owned by the user. */
  @Post('import')
  @HttpCode(201)
  @UseGuards(AuthGuard)
  async importForm(
    @CurrentUser() user: User,
    @Body(new ImportFormBodyPipe()) body: FormDefinition,
  ) {
    body.id = uuid();
    return this.repository.saveForm(user.id, body);
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

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async deleteForm(@CurrentUser() user: User, @Param('id') id: string) {
    const item = await managedForm(this.repository, id, user);
    await this.repository.deleteForm(item.form.id);
  }

  @Get(':id/submissions')
  @UseGuards(AuthGuard)
  async getSubmissions(@CurrentUser() user: User, @Param('id') id: string) {
    const item = await managedForm(this.repository, id, user);
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
    const item = await managedForm(this.repository, id, user);
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
    const item = await managedForm(this.repository, id, user);
    if (!(await this.repository.deleteSubmission(item.form.id, submissionId)))
      throw new NotFoundException({ error: 'not found' });
  }
}
