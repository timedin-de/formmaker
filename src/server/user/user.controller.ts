import { Controller, Get, UseGuards } from '@nestjs/common';
import { PublicUser } from '@shared/model';
import { publicUser } from '../auth';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../repository';

@Controller('user')
export class UserController {
  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: User): PublicUser {
    return publicUser(user);
  }
}
