export function hasSet<T extends object, K extends string>(
  object: T,
  attribute: K,
): object is T & Record<K, any> {
  return !!(attribute in object && (object as never)[attribute]);
}

export function has<T extends object, K extends string>(
  object: T,
  attribute: K,
): object is T & Record<K, any> {
  return attribute in object;
}
