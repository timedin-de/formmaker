import {
  BadRequestException,
  Body,
  ConflictException,
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
  UseGuards,
} from '@nestjs/common';
import { type PublicUser } from '@shared/model';
import { accountDeleteSchema, userCreateSchema } from '@shared/schemas';
import type z from 'zod';
import { hashPassword, publicUser, verifyPassword } from '../auth/auth-helper';
import { AdminGuard, AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Repository, type User } from '../repository';

@Controller('users')
export class UserController {
  constructor(
    @Inject(Repository) private readonly repository: Repository,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: User): PublicUser {
    return publicUser(user);
  }

  @Delete('me')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async deleteMe(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(accountDeleteSchema)) body: z.infer<typeof accountDeleteSchema>,
  ) {
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw new ForbiddenException({ error: 'invalid password' });
    }
    await this.repository.deleteUserWithData(user.id);
  }

  // ---- Admin user management ------------------------------------------------

  @Get('/')
  @UseGuards(AdminGuard)
  async listUsers() {
    return (await this.repository.users()).map(publicUser);
  }

  @Post('/')
  @HttpCode(201)
  @UseGuards(AdminGuard)
  async createUser(
    @Body(new ZodValidationPipe(userCreateSchema)) body: z.infer<typeof userCreateSchema>,
  ) {
    await this.auth.register(body.email, body.password, body.role);
  }

  @Patch('/:id')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async patchUser(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(userCreateSchema.partial()))
    body: Partial<z.infer<typeof userCreateSchema>>,
  ) {
    if (Object.keys(body).length === 0) {
      throw new BadRequestException({ error: 'empty patch' });
    }

    const patch: Partial<Omit<User, 'createdAt' | 'id'>> = {};
    if (body.email !== undefined) {
      const normalizedEmail = body.email.trim().toLowerCase();
      const existingUser = await this.repository.userByEmail(normalizedEmail);
      if (existingUser && existingUser.id !== id) {
        throw new ConflictException({ error: 'email already exists' });
      }
      patch.email = normalizedEmail;
    }
    if (body.role !== undefined) patch.role = body.role;
    if (body.password !== undefined) patch.passwordHash = await hashPassword(body.password);
    if (!(await this.repository.patchUser(id, patch)))
      throw new NotFoundException({ error: 'not found' });
  }
}
