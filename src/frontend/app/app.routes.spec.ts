import type { ActivatedRouteSnapshot, Params } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';

describe('builder route', () => {
  const policy = routes.find((r) => r.path === 'builder')?.runGuardsAndResolvers;
  const runsGuards = (from: Params, to: Params) => {
    if (typeof policy !== 'function') throw new Error('builder needs a guard policy function');
    const snapshot = (queryParams: Params) => ({ queryParams }) as ActivatedRouteSnapshot;
    return policy(snapshot(from), snapshot(to));
  };

  it('asks before another form is opened in the same builder', () => {
    expect(runsGuards({ id: 'a' }, { id: 'b' })).toBe(true);
    expect(runsGuards({ id: 'a' }, { new: '1' })).toBe(true);
  });

  it('does not ask when only the page changes or a new form gets its id', () => {
    expect(runsGuards({ id: 'a', page: 'p1' }, { id: 'a', page: 'p2' })).toBe(false);
    expect(runsGuards({ new: '1' }, { id: 'b' })).toBe(false);
  });
});
