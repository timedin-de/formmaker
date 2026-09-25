import z from 'zod';

const TOKEN_KEY = 'formmaker.token';

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
async function request(schema: undefined, path: string, init?: RequestInit): Promise<undefined>;
async function request<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T>;
async function request<T>(
  schema: z.ZodType<T> | undefined,
  path: string,
  init?: RequestInit,
): Promise<T | undefined> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : undefined),
    },
  });
  if (!res.ok) throw await errorFrom(res);
  if (!schema) return;

  const data = schema.parse(await res.json());
  return data;
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = `API ${res.status}`;
  try {
    const body = (await res.json()) as { error?: unknown; errorKey?: unknown };
    if (typeof body.error === 'string' && body.error !== '') message = body.error;
  } catch {
    // Non-JSON error body; keep the default message.
  }
  return new ApiError(message, res.status);
}

/** Best-effort user-facing message for an error thrown by `request`. */
export function apiErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'request failed';
}

export { request };
