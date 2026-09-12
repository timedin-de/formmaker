// Helper function that checks if the value exists in the object
export function has<T extends object, K extends PropertyKey>(
  object: T,
  attribute: K,
): object is Extract<T, Record<K, unknown>> {
  return attribute in object;
}
