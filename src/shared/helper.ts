// Helper function that checks if the value exists in the object
export function has<T extends object, K extends PropertyKey>(
  object: T,
  attribute: K,
): object is Extract<T, Record<K, unknown>> {
  return attribute in object;
}

export type CatchFnResult<T> = { data: T; error: null } | { data: null; error: unknown };

/** Execute a synchronous operation that may throw without losing its error. */
export function catchFn<T>(fn: () => T): CatchFnResult<T> {
  try {
    return { data: fn(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function catchFnAsync<T>(fn: () => Promise<T>): Promise<CatchFnResult<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}
