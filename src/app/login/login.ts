import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
    FormsModule,
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

  password = '';

  async submit(): Promise<void> {
    const ok = await this.auth.login(this.password);
    if (!ok) {
      this.snack.open(this.i18n.t('login.error'), 'OK', { duration: 3000 });
      return;
    }
    const redirect = (
      this.router.getCurrentNavigation()?.extras.state as { redirect?: string } | null
    )?.redirect;
    await this.router.navigate([redirect ?? '/']);
  }
}
