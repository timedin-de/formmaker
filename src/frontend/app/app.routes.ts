import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

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
    canActivate: [authGuard],
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
