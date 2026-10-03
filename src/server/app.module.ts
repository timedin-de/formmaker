import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { AuthService } from './auth/auth.service.js';
import { DatabaseModule } from './database.module.js';
import { FormsController } from './forms/forms.controller.js';
import { HealthController } from './health/health.controller.js';
import { UserController } from './user/user.controller.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [AuthService],
  controllers: [HealthController, UserController, FormsController],
})
export class AppModule {}
