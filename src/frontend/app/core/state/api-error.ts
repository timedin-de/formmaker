/** Error thrown on non-2xx responses; carries the human-readable server message. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** `ApiClient` already showed a message for this error (e.g. rate limiting). */
    readonly handled = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Best-effort user-facing message for an error thrown by `ApiClient.request`. */
export function apiErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'request failed';
}
