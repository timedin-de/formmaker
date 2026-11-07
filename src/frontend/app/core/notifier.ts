import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SNACK_TIME_ERROR, SNACK_TIME_OK } from './consts';
import { I18nService, type TranslationKey } from './i18n/translation.service';
import { ApiError } from './state/api-error';

type Params = Record<string, string | number>;

/** Snackbar messages with a translated dismiss action. */
@Injectable({ providedIn: 'root' })
export class Notifier {
  private readonly snack = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);

  /** Shows the translated success message for `key`. */
  ok(key: TranslationKey, params?: Params): void {
    this.show(this.i18n.t(key, params), SNACK_TIME_OK);
  }

  /** Shows the translated error message for `key`. */
  error(key: TranslationKey, params?: Params): void {
    this.errorText(this.i18n.t(key, params));
  }

  /** Shows an error text that is not a translation key, e.g. a server message. */
  errorText(message: string): void {
    this.show(message, SNACK_TIME_ERROR);
  }

  /** Shows `key` for a failed request, unless `ApiClient` already showed one (e.g. rate limiting). */
  apiError(error: unknown, key: TranslationKey, params?: Params): void {
    if (error instanceof ApiError && error.handled) return;
    this.error(key, params);
  }

  private show(message: string, duration: number): void {
    this.snack.open(message, this.i18n.t('common.ok'), { duration });
  }
}
