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
import { managedForm } from './managed-form';

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
  async addElement(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Body(new ZodValidationPipe(createElementSchema)) body: CreateElementRequest,
  ) {
    const item = await managedForm(this.repository, formId, user);
    return this.formService.addElement(item, body);
  }

  @Post(':elementId/clone')
  @HttpCode(201)
  async cloneElement(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Body(new ZodValidationPipe(cloneRequestSchema)) body: CloneRequest,
  ) {
    const item = await managedForm(this.repository, formId, user);
    return this.formService.cloneElement(item, elementId, body);
  }

  @Delete(':elementId')
  @HttpCode(204)
  async deleteElement(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
  ) {
    const item = await managedForm(this.repository, formId, user);
    await this.formService.deleteElement(item, elementId);
  }

  @Post(':elementId/options')
  @HttpCode(201)
  async addOption(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Body(new ZodValidationPipe(createOptionSchema)) body: CreateOptionRequest,
  ) {
    const item = await managedForm(this.repository, formId, user);
    return this.formService.addOption(item, elementId, body);
  }

  @Patch(':elementId/options/:optionId')
  @HttpCode(200)
  async updateOption(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Param('optionId') optionId: string,
    @Body(new ZodValidationPipe(updateOptionSchema)) body: UpdateOptionRequest,
  ) {
    const item = await managedForm(this.repository, formId, user);
    return this.formService.updateOption(item, elementId, optionId, body);
  }

  @Delete(':elementId/options/:optionId')
  @HttpCode(204)
  async deleteOption(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Param('optionId') optionId: string,
  ) {
    const item = await managedForm(this.repository, formId, user);
    await this.formService.deleteOption(item, elementId, optionId);
  }

  @Post(':elementId/validations')
  @HttpCode(201)
  async addValidationRule(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Body(new ZodValidationPipe(createValidationRuleSchema)) body: CreateValidationRuleRequest,
  ) {
    const item = await managedForm(this.repository, formId, user);
    return this.formService.addValidationRule(item, elementId, body);
  }

  @Patch(':elementId/validations/:ruleId')
  @HttpCode(200)
  async updateValidationRule(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Param('ruleId') ruleId: string,
    @Body(new ZodValidationPipe(updateValidationRuleSchema)) body: UpdateValidationRuleRequest,
  ) {
    const item = await managedForm(this.repository, formId, user);
    return this.formService.updateValidationRule(item, elementId, ruleId, body);
  }

  @Delete(':elementId/validations/:ruleId')
  @HttpCode(204)
  async deleteValidationRule(
    @CurrentUser() user: User,
    @Param('formId') formId: string,
    @Param('elementId') elementId: string,
    @Param('ruleId') ruleId: string,
  ) {
    const item = await managedForm(this.repository, formId, user);
    await this.formService.deleteValidationRule(item, elementId, ruleId);
  }
}
