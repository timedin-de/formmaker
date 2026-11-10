import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Repository, User } from '../repository';

/** Whether `user` may manage a form owned by `ownerId`: its owner or an admin. */
export function canManage(ownerId: string, user: User): boolean {
  return user.role === 'admin' || user.id === ownerId;
}

/** Loads a form the user may manage, or throws 404 / 403. */
export async function managedForm(repository: Repository, id: string, user: User) {
  const item = await repository.form(id);
  if (!item) throw new NotFoundException({ error: 'not found' });
  if (!canManage(item.ownerId, user)) throw new ForbiddenException({ error: 'not form owner' });
  return item;
}
