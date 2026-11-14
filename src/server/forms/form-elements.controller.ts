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
  type CreateElementRequest,
  createElementSchema,
  type CreateOptionRequest,
  createOptionSchema,
  type CreateValidationRuleRequest,
  createValidationRuleSchema,
  type MoveElementRequest,
  moveElementSchema,
  type UpdateElementRequest,
  updateElementSchema,
  type UpdateOptionRequest,
  updateOptionSchema,
  type UpdateValidationRuleRequest,
  updateValidationRuleSchema,
} from '@shared/schemas';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Repository, type User } from '../repository';
import { FormService } from './form.service';
import { changeManagedForm } from './managed-form';

/** Elements of a form and their sub-resources: choice options and validation rules. */
@Controller('forms/:formId/elements')
@UseGuards(AuthGuard)
export class FormElementsController {
  constructor(
    @Inject(Repository) private readonly repository: Repository,
    @Inject(FormService) private readonly formService: FormService,
  ) {}

  @Post()
  @HttpCode(201)
  addElement(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Body(new ZodValidationPipe(createElementSchema)) body: CreateElementRequest,
  ) {
    return changeManagedForm(this.repository, formId, user, (item) =>
      this.formService.addElement(item, body),
    );
  }

  @Post(':elementId/clone')
  @HttpCode(201)
  cloneElement(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Body(new ZodValidationPipe(cloneRequestSchema)) body: CloneRequest,
  ) {
    return changeManagedForm(this.repository, formId, user, (item) =>
      this.formService.cloneElement(item, elementId, body),
    );
  }

  @Post(':elementId/move')
  @HttpCode(204)
  async moveElement(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Body(new ZodValidationPipe(moveElementSchema)) body: MoveElementRequest,
  ) {
    await changeManagedForm(this.repository, formId, user, (item) =>
      this.formService.moveElement(item, elementId, body),
    );
  }

  @Patch(':elementId')
  @HttpCode(200)
  updateElement(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Body(new ZodValidationPipe(updateElementSchema)) body: UpdateElementRequest,
  ) {
    return changeManagedForm(this.repository, formId, user, (item) =>
      this.formService.updateElement(item, elementId, body),
    );
  }

  @Delete(':elementId')
  @HttpCode(204)
  async deleteElement(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
  ) {
    await changeManagedForm(this.repository, formId, user, (item) =>
      this.formService.deleteElement(item, elementId),
    );
  }

  @Post(':elementId/options')
  @HttpCode(201)
  addOption(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Body(new ZodValidationPipe(createOptionSchema)) body: CreateOptionRequest,
  ) {
    return changeManagedForm(this.repository, formId, user, (item) =>
      this.formService.addOption(item, elementId, body),
    );
  }

  @Patch(':elementId/options/:optionId')
  @HttpCode(200)
  updateOption(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Param('optionId') optionId: string,
    @Body(new ZodValidationPipe(updateOptionSchema)) body: UpdateOptionRequest,
  ) {
    return changeManagedForm(this.repository, formId, user, (item) =>
      this.formService.updateOption(item, elementId, optionId, body),
    );
  }

  @Delete(':elementId/options/:optionId')
  @HttpCode(204)
  async deleteOption(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Param('optionId') optionId: string,
  ) {
    await changeManagedForm(this.repository, formId, user, (item) =>
      this.formService.deleteOption(item, elementId, optionId),
    );
  }

  @Post(':elementId/validations')
  @HttpCode(201)
  addValidationRule(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Body(new ZodValidationPipe(createValidationRuleSchema)) body: CreateValidationRuleRequest,
  ) {
    return changeManagedForm(this.repository, formId, user, (item) =>
      this.formService.addValidationRule(item, elementId, body),
    );
  }

  @Patch(':elementId/validations/:ruleId')
  @HttpCode(200)
  updateValidationRule(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Param('ruleId') ruleId: string,
    @Body(new ZodValidationPipe(updateValidationRuleSchema)) body: UpdateValidationRuleRequest,
  ) {
    return changeManagedForm(this.repository, formId, user, (item) =>
      this.formService.updateValidationRule(item, elementId, ruleId, body),
    );
  }

  @Delete(':elementId/validations/:ruleId')
  @HttpCode(204)
  async deleteValidationRule(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Param('ruleId') ruleId: string,
  ) {
    await changeManagedForm(this.repository, formId, user, (item) =>
      this.formService.deleteValidationRule(item, elementId, ruleId),
    );
  }
}
