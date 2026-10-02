import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Keeps the API error contract `{ error: string, details? }` that the frontend
 * relies on, instead of Nest's default `{ statusCode, message }` body.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res.status(exception.getStatus()).json(typeof body === 'string' ? { error: body } : body);
      return;
    }

    console.error('Unhandled Server Error', exception);
    const code =
      typeof exception === 'object' && exception !== null && 'code' in exception
        ? exception.code
        : undefined;
    res
      .status(
        code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
          ? HttpStatus.CONFLICT
          : HttpStatus.INTERNAL_SERVER_ERROR,
      )
      .json({ error: 'internal server error' });
  }
}
