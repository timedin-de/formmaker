import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiErrorMessage, request } from './api-client';

function jsonResponse(body: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('api-client request', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
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
