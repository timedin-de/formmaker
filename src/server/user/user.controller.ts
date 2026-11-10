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
  Put,
  UseGuards,
} from '@nestjs/common';
import { importPublicKey, keyIdOf } from '@shared/crypto';
import { type PublicUser, type UserEncryptionKey } from '@shared/model';
import {
  accountDeleteSchema,
  type SaveEncryptionKeyRequest,
  saveEncryptionKeySchema,
  userCreateSchema,
} from '@shared/schemas';
import * as z from 'zod/mini';
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

  /** The caller's encryption key pair; the private key is wrapped with their passphrase. */
  @Get('me/encryption-key')
  @UseGuards(AuthGuard)
  async encryptionKey(@CurrentUser() user: User): Promise<UserEncryptionKey> {
    const key = await this.repository.encryptionKey(user.id);
    if (!key) throw new NotFoundException({ error: 'no encryption key' });
    return key;
  }

  /**
   * Stores the caller's key pair. Rewrapping the same key (new passphrase) is
   * always allowed; a different key needs `replace: true`, because answers
   * encrypted for the old key can no longer be read.
   */
  @Put('me/encryption-key')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async saveEncryptionKey(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(saveEncryptionKeySchema)) body: SaveEncryptionKeyRequest,
  ): Promise<UserEncryptionKey> {
    const { replace, ...key } = body;
    let keyId: string;
    try {
      // Importing also rejects points that are not on the curve.
      await importPublicKey(key.publicKey);
      keyId = await keyIdOf(key.publicKey);
    } catch {
      throw new BadRequestException({ error: 'invalid public key' });
    }
    if (keyId !== key.keyId)
      throw new BadRequestException({ error: 'keyId does not match the public key' });

    const existing = await this.repository.encryptionKey(user.id);
    if (existing && existing.keyId !== key.keyId && !replace)
      throw new ConflictException({ error: 'an encryption key already exists' });

    await this.repository.saveEncryptionKey(user.id, key);
    return key;
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
    @Body(new ZodValidationPipe(z.partial(userCreateSchema)))
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
    if (patch.passwordHash !== undefined) await this.repository.clearUsersSessions(id);
  }
}
