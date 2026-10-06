import { Injectable, Injector, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import type z from 'zod';
import { AuthService } from '../auth/auth.service';
import { I18nService } from '../i18n/translation.service';

const TOKEN_KEY = 'formmaker.token';
const LOGOUT_PATH = '/api/auth/logout';

/** Error thrown on non-2xx responses; carries the human-readable server message. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Best-effort user-facing message for an error thrown by `ApiClient.request`. */
export function apiErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'request failed';
}

@Injectable({ providedIn: 'root' })
export class ApiClient {
  // AuthService is resolved lazily: it depends on this client through its repositories.
  private readonly injector = inject(Injector);
  private readonly snack = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);

  request(schema: undefined, path: string, init?: RequestInit): Promise<undefined>;
  request<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T>;
  async request<T>(
    schema: z.ZodType<T> | undefined,
    path: string,
    init?: RequestInit,
  ): Promise<T | undefined> {
    const sentToken = sessionStorage.getItem(TOKEN_KEY);
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : undefined),
        ...(sentToken ? { Authorization: `Bearer ${sentToken}` } : undefined),
      },
    });
    if (!res.ok) throw await this.handleError(res, path, sentToken);
    if (!schema) return;

    return schema.parse(await res.json());
  }

  private async handleError(
    res: Response,
    path: string,
    sentToken: string | null,
  ): Promise<ApiError> {
    if (res.status === 429) {
      const message = this.i18n.t('error.rateLimited');
      this.snack.open(message, 'OK', { duration: 5000 });
      return new ApiError(message, res.status);
    }
    // A 401 means the session is no longer valid. Without a token it is not a session
    // problem, and the logout call itself must not recurse into another logout.
    if (
      res.status === 401 &&
      sentToken &&
      sentToken === sessionStorage.getItem(TOKEN_KEY) &&
      path !== LOGOUT_PATH
    )
      await this.injector.get(AuthService).expireSession();
    return await errorFrom(res);
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = `API ${res.status}`;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error !== '') message = body.error;
  } catch {
    // Non-JSON error body; keep the default message.
  }
  return new ApiError(message, res.status);
}
