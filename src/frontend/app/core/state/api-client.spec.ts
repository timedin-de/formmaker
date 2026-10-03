import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { I18nService } from '../i18n/translation.service';
import { ApiClient, ApiError, apiErrorMessage } from './api-client';

function jsonResponse(body: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('api-client request', () => {
  const fetchMock = vi.fn();
  const snack = { open: vi.fn() };
  const auth = { expireSession: vi.fn(() => Promise.resolve()) };
  let request: ApiClient['request'];

  beforeEach(() => {
    snack.open.mockReset();
    auth.expireSession.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: MatSnackBar, useValue: snack },
        { provide: AuthService, useValue: auth },
      ],
    });
    TestBed.inject(I18nService).lang.set('en');
    const client = TestBed.inject(ApiClient);
    request = client.request.bind(client) as ApiClient['request'];
    sessionStorage.clear();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a GET without an Authorization header when no token is stored', async () => {
    await request(undefined, '/api/users/me');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/me',
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
      }),
    );
  });

  it('attaches the bearer token when present in sessionStorage', async () => {
    sessionStorage.setItem('formmaker.token', 'secret-token');
    await request(undefined, '/api/users/me');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/me',
      expect.objectContaining({ headers: { Authorization: 'Bearer secret-token' } }),
    );
  });

  it('sets a JSON content type only when a body is sent', async () => {
    await request(undefined, '/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ email: 'a@b.c' }),
    });

    const headers = fetchMock.mock.calls[0][1]?.headers;
    expect(headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('resolves undefined on a 204 response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null, 204));
    await expect(request(undefined, '/x')).resolves.toBeUndefined();
  });

  it('rejects with the server message on a non-2xx JSON response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'email already exists' }, 409, false));
    await expect(request(undefined, '/x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'email already exists',
    });
  });

  it('rejects with a generic message when the error body carries no usable text', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500, false));
    await expect(request(undefined, '/x')).rejects.toEqual(new ApiError('API 500', 500));
  });

  it('rejects with a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as unknown as Response);
    await expect(request(undefined, '/x')).rejects.toEqual(new ApiError('API 500', 500));
  });

  it('shows a translated snackbar and rejects on 429', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.reject(new SyntaxError('Too many requests')),
    } as unknown as Response);
    const message = TestBed.inject(I18nService).t('error.rateLimited');

    await expect(request(undefined, '/x')).rejects.toEqual(new ApiError(message, 429));
    expect(snack.open).toHaveBeenCalledWith(message, 'OK', { duration: 5000 });
    expect(auth.expireSession).not.toHaveBeenCalled();
  });

  it('expires the session on 401 with a stored token', async () => {
    sessionStorage.setItem('formmaker.token', 'stale');
    fetchMock.mockResolvedValue(jsonResponse({ error: 'authentication required' }, 401, false));

    await expect(request(undefined, '/x')).rejects.toMatchObject({ status: 401 });
    expect(auth.expireSession).toHaveBeenCalledOnce();
  });

  it('ignores a 401 without a stored token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 401, false));

    await expect(request(undefined, '/x')).rejects.toMatchObject({ status: 401 });
    expect(auth.expireSession).not.toHaveBeenCalled();
  });

  it('does not recurse when the logout request itself returns 401', async () => {
    sessionStorage.setItem('formmaker.token', 'stale');
    fetchMock.mockResolvedValue(jsonResponse({}, 401, false));

    await expect(request(undefined, '/api/auth/logout')).rejects.toMatchObject({ status: 401 });
    expect(auth.expireSession).not.toHaveBeenCalled();
  });
});

describe('apiErrorMessage', () => {
  it('prefers the Error message', () => {
    expect(apiErrorMessage(new ApiError('email already exists', 409))).toBe('email already exists');
  });

  it('falls back to a generic message for non-errors', () => {
    expect(apiErrorMessage('boom')).toBe('request failed');
    expect(apiErrorMessage(null)).toBe('request failed');
    expect(apiErrorMessage(new Error(''))).toBe('request failed');
  });
});
