import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type CloneRequest,
  cloneRequestSchema,
  createPageSchema,
  type UpdatePageRequest,
  updatePageSchema,
} from '@shared/schemas';
import type * as z from 'zod/mini';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Repository, type User } from '../repository';
import { FormService } from './form.service';
import { managedForm } from './managed-form';

/** Pages of a form. */
@Controller('forms/:formId/pages')
@UseGuards(AuthGuard)
export class FormPagesController {
  constructor(
    @Inject(Repository) private readonly repository: Repository,
    @Inject(FormService) private readonly formService: FormService,
  ) {}

  @Post()
  @HttpCode(201)
  async addPage(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Body(new ZodValidationPipe(createPageSchema)) body: z.infer<typeof createPageSchema>,
  ) {
    const item = await managedForm(this.repository, formId, user);
    return this.formService.addPage(item, body.title);
  }

  @Patch(':pageId')
  @HttpCode(200)
  async updatePage(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('pageId') pageId: string,
    @Body(new ZodValidationPipe(updatePageSchema)) body: UpdatePageRequest,
  ) {
    const item = await managedForm(this.repository, formId, user);
    return this.formService.updatePage(item, pageId, body);
  }

  @Post(':pageId/clone')
  @HttpCode(201)
  async clonePage(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('pageId') pageId: string,
    @Body(new ZodValidationPipe(cloneRequestSchema)) body: CloneRequest,
  ) {
    const item = await managedForm(this.repository, formId, user);
    return this.formService.clonePage(item, pageId, body);
  }

  @Delete(':pageId')
  @HttpCode(204)
  async deletePage(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('pageId') pageId: string,
  ) {
    const item = await managedForm(this.repository, formId, user);
    await this.formService.deletePage(item, pageId);
  }
}
