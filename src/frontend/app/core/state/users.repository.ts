import { Injectable } from '@angular/core';
import type { PublicUser } from '@shared/model/user.model';
import { request } from './api-client';

/** Self-service account operations for the signed-in user. */
@Injectable({ providedIn: 'root' })
export class UsersRepository {
  me(): Promise<PublicUser> {
    return request<PublicUser>('/api/users/me');
  }

  updateEmail(email: string, currentPassword: string): Promise<PublicUser> {
    return request<PublicUser>('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ email, currentPassword }),
    });
  }

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return request<void>('/api/users/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  deleteAccount(currentPassword: string): Promise<void> {
    return request<void>('/api/users/me', {
      method: 'DELETE',
      body: JSON.stringify({ currentPassword }),
    });
  }
}
