import { EntitySchema } from 'typeorm';
import { UserRole } from '../repository.js';

export interface UserEntityModel {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}
export interface SessionEntityModel {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export const UserEntity = new EntitySchema<UserEntityModel>({
  name: 'User',
  tableName: 'users',
  columns: {
    id: { type: String, primary: true },
    email: { type: String, length: 320, unique: true },
    passwordHash: { name: 'password_hash', type: String },
    role: { type: String },
    createdAt: { name: 'created_at', type: String },
  },
});
export const SessionEntity = new EntitySchema<SessionEntityModel>({
  name: 'Session',
  tableName: 'sessions',
  columns: {
    tokenHash: { name: 'token_hash', type: String, primary: true },
    userId: { name: 'user_id', type: String },
    expiresAt: { name: 'expires_at', type: String },
    createdAt: { name: 'created_at', type: String },
  },
  indices: [{ columns: ['expiresAt'] }],
});
