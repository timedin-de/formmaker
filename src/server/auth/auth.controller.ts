import { Body, Controller, HttpCode, Inject, Post, Put, UseGuards } from '@nestjs/common';
import type { z } from 'zod';
import {
  emailUpdateSchema,
  loginSchema,
  passwordChangeSchema,
  registrationSchema,
} from '../../shared/schemas/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type User } from '../repository.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService, type AuthResult } from './auth.service.js';
import { CurrentTokenHash } from './current-token.decorator.js';
import { CurrentUser } from './current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>,
  ): Promise<AuthResult> {
    return this.auth.login(body.email, body.password);
  }

  @Post('register')
  @HttpCode(204)
  register(
    @Body(new ZodValidationPipe(registrationSchema)) body: z.infer<typeof registrationSchema>,
  ): Promise<void> {
    return this.auth.register(body.email, body.password);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  logout(@CurrentTokenHash() tokenHash: string): Promise<void> {
    return this.auth.logout(tokenHash);
  }

  @Put('password')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: User,
    @CurrentTokenHash() token: string,
    @Body(new ZodValidationPipe(passwordChangeSchema)) body: z.infer<typeof passwordChangeSchema>,
  ) {
    return this.auth.changePassword(user, body.currentPassword, body.newPassword, token);
  }

  @Put('email')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async changeEmail(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(emailUpdateSchema)) body: z.infer<typeof emailUpdateSchema>,
  ) {
    if (await this.auth.changeEmail(user, body.currentPassword, body.email)) {
      return { ...user, email: body.email };
    }
  }
}
