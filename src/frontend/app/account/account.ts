import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroupDirective,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { UserRole } from '@shared/model/user.model';
import { AuthService } from '../core/auth/auth.service';
import { PasswordField } from '../core/components';
import { TextField } from '../core/components/text-field/text-field';
import { I18nService } from '../core/i18n';
import { apiErrorMessage } from '../core/state/api-client';
import { UsersRepository } from '../core/state/users.repository';
import { fieldMatchValidator } from '../core/validators';

@Component({
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PasswordField,
    ReactiveFormsModule,
    TextField,
    FormsModule,
  ],
  selector: 'fm-account',
  styleUrl: './account.scss',
  templateUrl: './account.html',
})
export class Account {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UsersRepository);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);

  private readonly fb = inject(FormBuilder);

  readonly user = this.auth.user;

  readonly emailForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  readonly passwordForm = this.fb.group(
    {
      currentPassword: ['', [Validators.required, Validators.minLength(8)]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required, Validators.minLength(8)]],
    },
    { validators: [fieldMatchValidator('newPassword', 'confirmPassword')] },
  );

  readonly deletePassword = new FormControl('', [Validators.required, Validators.minLength(8)]);

  protected readonly confirmDelete = signal(false);

  constructor() {
    if (this.auth.authenticated()) {
      this.auth.loadUser().then(() => {
        this.emailForm.setValue({ email: this.auth.user()?.email ?? '', password: '' });
      });
    }
  }

  memberSince(createdAt: string): string {
    try {
      return new Date(createdAt).toLocaleDateString();
    } catch {
      return createdAt;
    }
  }

  roleLabel(role: UserRole): string {
    return this.i18n.t(role === 'admin' ? 'account.role.admin' : 'account.role.editor');
  }

  async saveEmail(formDir: FormGroupDirective): Promise<void> {
    if (this.emailForm.pristine || this.emailForm.invalid) return;
    const { email, password } = this.emailForm.value;

    if (!email || !password) return;
    try {
      const updated = await this.users.updateEmail(email, password);
      this.user.set(updated);

      formDir.resetForm();
      this.emailForm.controls.email.setValue(email);

      this.snack.open(this.i18n.t('account.emailSaved'), 'OK', { duration: 3000 });
    } catch (error) {
      this.fail(apiErrorMessage(error));
    }
  }

  async savePassword(formDir: FormGroupDirective): Promise<void> {
    if (this.passwordForm.pristine || this.passwordForm.invalid) return;
    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.value;

    if (!currentPassword || !newPassword || !confirmPassword) return;

    try {
      await this.users.changePassword(currentPassword, newPassword);
      formDir.resetForm();
      this.snack.open(this.i18n.t('account.passwordChanged'), 'OK', { duration: 3000 });
    } catch (error) {
      this.fail(apiErrorMessage(error));
    }
  }

  async deleteAccount(): Promise<void> {
    if (this.deletePassword.pristine || this.deletePassword.invalid) return;
    const value = this.deletePassword.value;
    if (!value) return;

    try {
      await this.users.deleteAccount(value);
      await this.auth.logout();
      this.snack.open(this.i18n.t('account.accountDeleted'), 'OK', { duration: 3000 });
      await this.router.navigate(['/login']);
    } catch (error) {
      this.fail(apiErrorMessage(error));
    }
  }

  private fail(message: string): void {
    this.snack.open(message, 'OK', { duration: 4000 });
  }
}
