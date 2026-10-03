import { Injectable, inject } from '@angular/core';
import type { PublicUser } from '@shared/model/user.model';
import { publicUserSchema } from '@shared/schemas';
import { ApiClient } from './api-client';

/** Self-service account operations for the signed-in user. */
@Injectable({ providedIn: 'root' })
export class UsersRepository {
  private readonly api = inject(ApiClient);

  me(): Promise<PublicUser> {
    return this.api.request(publicUserSchema, '/api/users/me');
  }

  updateEmail(email: string, currentPassword: string): Promise<PublicUser> {
    return this.api.request(publicUserSchema, '/api/auth/email', {
      method: 'PUT',
      body: JSON.stringify({ email, currentPassword }),
    });
  }

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.api.request(undefined, '/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  deleteAccount(currentPassword: string): Promise<void> {
    return this.api.request(undefined, '/api/users/me', {
      method: 'DELETE',
      body: JSON.stringify({ currentPassword }),
    });
  }
}
