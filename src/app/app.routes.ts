import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./landing/landing').then((m) => m.LandingComponent),
  },
  {
    path: 'builder',
    loadComponent: () => import('./builder/builder').then((m) => m.BuilderComponent),
  },
  { path: 'runner/:id', loadComponent: () => import('./runner/runner').then((m) => m.Runner) },
  { path: 'results/:id', loadComponent: () => import('./results/results').then((m) => m.Results) },
  { path: '**', redirectTo: '' },
];
