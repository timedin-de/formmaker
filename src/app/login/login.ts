import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../core/auth/auth.service';
import { I18nService } from '../core/i18n';

@Component({
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSnackBarModule,
  ],
  selector: 'fm-login',
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  protected readonly i18n = inject(I18nService);

  readonly email = signal('');
  readonly password = signal('');
  readonly registering = signal(false);

  async submit(): Promise<void> {
    const ok = this.registering()
      ? await this.auth.register(this.email(), this.password())
      : await this.auth.login(this.password(), this.email() || undefined);
    if (!ok) {
      this.snack.open(this.i18n.t('login.error'), 'OK', { duration: 3000 });
      return;
    }
    const redirect = (this.router.currentNavigation()?.extras.state as { redirect?: string } | null)
      ?.redirect;
    await this.router.navigate([redirect ?? '/']);
  }

  toggleRegistration(): void {
    this.registering.update((value) => !value);
  }
}
