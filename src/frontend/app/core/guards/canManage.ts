import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { canManage } from '@shared/helper';
import { AuthService } from '../auth';
import { Notifier } from '../notifier';
import { FormsRepository } from '../state/forms.repository';

/** Where the guarded route carries the form id: a path param or a query param. */
type FormIdSource = { param: string; query?: undefined } | { query: string; param?: undefined };

/**
 * Lets only users who may manage the form (its owner or an admin) open the route; others go to
 * the landing page with a snackbar message, or to the login when signed out. A route without an id passes (the builder
 * creates a new form then).
 */
export const canManageGuard =
  (source: FormIdSource): CanActivateFn =>
  async (route) => {
    // Everything is injected before the first `await`, where the injection context ends.
    const auth = inject(AuthService);
    const router = inject(Router);
    const repo = inject(FormsRepository);
    const notifier = inject(Notifier);

    await auth.loadUser();
    const user = auth.user();
    if (!auth.authenticated() || !user) return router.createUrlTree(['/login']);

    const id =
      source.param !== undefined
        ? route.paramMap.get(source.param)
        : route.queryParamMap.get(source.query);
    if (!id) return source.query !== undefined ? true : router.createUrlTree(['/']);

    let form;
    try {
      form = await repo.getForm(id);
    } catch (error) {
      notifier.apiError(error, 'builder.loadFailed');
      return router.createUrlTree(['/']);
    }
    if (form && canManage(form, user)) return true;
    notifier.error(form ? 'builder.notManaged' : 'builder.loadFailed');
    return router.createUrlTree(['/']);
  };
