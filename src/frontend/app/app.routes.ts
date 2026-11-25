import { inject } from '@angular/core';
import { type CanActivateFn, Router, type Routes } from '@angular/router';
import type { BuilderComponent } from './builder/builder';
import { authGuard } from './core/auth/auth.guard';

/** The builder edits the form `?id=` names; without one, the list is where it is picked. */
export const builderFormGuard: CanActivateFn = (route) =>
  route.queryParams['id'] ? true : inject(Router).createUrlTree(['/']);

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./login/login').then((m) => m.Login) },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: () => import('./landing/landing').then((m) => m.LandingComponent),
  },
  {
    path: 'builder',
    canActivate: [authGuard, builderFormGuard],
    // Don't lose edits that failed or are still being sent.
    canDeactivate: [(builder: BuilderComponent) => builder.canLeave()],
    // Also when only `?id=` changes to open another form in the same builder, or is dropped
    // (Angular's default skips query parameter changes), but not for `?page=`.
    runGuardsAndResolvers: (from, to) => from.queryParams['id'] !== to.queryParams['id'],
    loadComponent: () => import('./builder/builder').then((m) => m.BuilderComponent),
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./account/account').then((m) => m.Account),
  },
  { path: 'runner/:id', loadComponent: () => import('./runner/runner').then((m) => m.Runner) },
  {
    path: 'results/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./results/results').then((m) => m.Results),
  },
  { path: '**', redirectTo: '' },
];
