import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { PublicUser } from '../../shared/model/user.model.js';
import { loginSchema, registrationSchema } from '../../shared/schemas/index.js';
import type { z } from 'zod';
import { publicUser } from '../auth.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { User } from '../repository.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService, type AuthResult } from './auth.service.js';
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
  register(
    @Body(new ZodValidationPipe(registrationSchema)) body: z.infer<typeof registrationSchema>,
  ): Promise<AuthResult> {
    return this.auth.register(body.email, body.password);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  logout(@Req() req: Request): Promise<void> {
    return this.auth.logout(req);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: User): PublicUser {
    return publicUser(user);
  }
}
