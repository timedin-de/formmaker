import { type Routes } from '@angular/router';
import type { BuilderComponent } from './builder/builder';
import { authGuard } from './core/auth/auth.guard';
import { canManageGuard } from './core/guards/canManage';

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
    canActivate: [authGuard, canManageGuard({ query: 'id' })],
    // Don't lose edits that failed or are still being sent.
    canDeactivate: [(builder: BuilderComponent) => builder.canLeave()],
    // Also when only `?id=` changes to open another form in the same builder (Angular's
    // default skips query parameter changes), but not for `?page=` or the `?new=1` →
    // `?id=` step after creating a form.
    runGuardsAndResolvers: (from, to) =>
      from.queryParams['id'] !== undefined && from.queryParams['id'] !== to.queryParams['id'],
    loadComponent: () => import('./builder/builder').then((m) => m.BuilderComponent),
  },
  {
    path: 'builder/preview/:id',
    canActivate: [canManageGuard({ param: 'id' })],
    loadComponent: () => import('./runner/runner').then((m) => m.Runner),
    data: { preview: true },
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
