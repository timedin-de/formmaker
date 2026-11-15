import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Repository, User } from '../repository';
import type { OwnedForm } from './form.service';

/** How often a form change is applied again after losing a race; see `changeManagedForm`. */
const CONFLICT_RETRIES = 2;

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

/**
 * Loads a form the user may manage (see `managedForm`) and runs `change` on it, which
 * saves against the revision the form was loaded at. If another request saved the form
 * in between, that save fails with 409 and nothing is written; then the form is loaded
 * again and `change` runs on the new state, so neither request's change gets lost.
 */
export async function changeManagedForm<T>(
  repository: Repository,
  id: string,
  user: User,
  change: (item: OwnedForm) => Promise<T>,
): Promise<T> {
  for (let retries = CONFLICT_RETRIES; ; retries--) {
    const item = await managedForm(repository, id, user);
    try {
      return await change(item);
    } catch (error) {
      if (retries === 0 || !(error instanceof ConflictException)) throw error;
    }
  }
}
