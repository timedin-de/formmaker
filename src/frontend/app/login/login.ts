import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { PasswordField, TextField } from '../core/components';
import { I18nService } from '../core/i18n';
import { fieldMatchValidator } from '../core/validators';

@Component({
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSnackBarModule,
    PasswordField,
    TextField,
    ReactiveFormsModule,
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
  protected readonly fb = inject(FormBuilder);

  readonly email = signal('');
  readonly password = signal('');
  readonly registering = signal(false);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    passwordRepeat: [''],
  });

  constructor() {
    effect(() => {
      const confirmPasswordControl = this.form.get('passwordRepeat');
      if (this.registering()) {
        confirmPasswordControl?.setValidators([Validators.required, Validators.minLength(8)]);
        this.form.setValidators(fieldMatchValidator('password', 'passwordRepeat'));
      } else {
        confirmPasswordControl?.clearValidators();
        this.form.clearValidators();
      }
      confirmPasswordControl?.updateValueAndValidity();
    });
  }

  async submit(): Promise<void> {
    const { email, password } = this.form.getRawValue();

    if (!email || !password) return;

    const ok = this.registering()
      ? await this.auth.register(email, password)
      : await this.auth.login(email, password);
    if (!ok) {
      this.snack.open(this.i18n.t(this.registering() ? 'register.error' : 'login.error'), 'OK', {
        duration: 3000,
      });
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
