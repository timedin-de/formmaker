import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  type Params,
  provideRouter,
  Router,
  type RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { describe, expect, it } from 'vitest';
import { builderFormGuard, routes } from './app.routes';

const snapshot = (queryParams: Params) => ({ queryParams }) as ActivatedRouteSnapshot;

describe('builder route', () => {
  const policy = routes.find((r) => r.path === 'builder')?.runGuardsAndResolvers;
  const runsGuards = (from: Params, to: Params) => {
    if (typeof policy !== 'function') throw new Error('builder needs a guard policy function');
    return policy(snapshot(from), snapshot(to));
  };

  it('asks before another form is opened in the same builder or the form is dropped', () => {
    expect(runsGuards({ id: 'a' }, { id: 'b' })).toBe(true);
    expect(runsGuards({ id: 'a' }, {})).toBe(true);
  });

  it('does not ask when only the page changes', () => {
    expect(runsGuards({ id: 'a', page: 'p1' }, { id: 'a', page: 'p2' })).toBe(false);
  });
});

describe('builderFormGuard', () => {
  const check = (queryParams: Params) => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    return TestBed.runInInjectionContext(() =>
      builderFormGuard(snapshot(queryParams), {} as RouterStateSnapshot),
    );
  };

  it('opens the builder for a form', () => {
    expect(check({ id: 'a', page: 'p1' })).toBe(true);
  });

  it('sends the builder without a form to the list, also for the old ?new=1', () => {
    for (const params of [{}, { page: 'p1' }, { new: '1' }]) {
      const result = check(params);
      expect(result).toBeInstanceOf(UrlTree);
      expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/');
      TestBed.resetTestingModule();
    }
  });
});
