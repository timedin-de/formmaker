export type UserRole = 'admin' | 'editor';

/** User as exposed through the API — never carries the password hash. */
export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}
