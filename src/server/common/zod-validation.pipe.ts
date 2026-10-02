import { UnprocessableEntityException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validates a request value against a shared zod schema and returns the parsed
 * result. Failures keep the API's existing 422 `{ error, details }` body.
 * Usage: `@Body(new ZodValidationPipe(loginSchema)) body: LoginInput`.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new UnprocessableEntityException({
      error: 'invalid request',
      details: parsed.error.issues,
    });
  }
}
