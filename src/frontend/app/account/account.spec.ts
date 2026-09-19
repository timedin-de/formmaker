import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FormGroupDirective } from '@angular/forms';
import { MatIconRegistry } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import type { PublicUser } from '@shared/model/user.model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../core/auth/auth.service';
import { I18nService } from '../core/i18n';
import { ApiError } from '../core/state/api-client';
import { UsersRepository } from '../core/state/users.repository';
import { Account } from './account';

/** `svgIcon` names referenced by the account template. */
const ICONS = ['account_circle', 'lock', 'save', 'delete_outline'];

function makeUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: '1',
    email: 'demo@formmaker.local',
    role: 'editor',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Account', () => {
  let component: Account;
  let fixture: ComponentFixture<Account>;
  let i18n: I18nService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Account],
      providers: [
        provideRouter([]),
        I18nService,
        { provide: UsersRepository, useValue: {} },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
      ],
    }).compileComponents();

    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    const svg = sanitizer.bypassSecurityTrustHtml(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>',
    );
    for (const name of ICONS) registry.addSvgIconLiteral(name, svg);

    fixture = TestBed.createComponent(Account);
    component = fixture.componentInstance;
    i18n = TestBed.inject(I18nService);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('translates editor and admin roles', () => {
    expect(component.roleLabel('editor')).toBe(i18n.t('account.role.editor'));
    expect(component.roleLabel('admin')).toBe(i18n.t('account.role.admin'));
  });

  it('formats the member-since date', () => {
    const stamp = '2026-01-02T03:04:05.000Z';
    expect(component.memberSince(stamp)).toBe(new Date(stamp).toLocaleDateString());
  });

  it('reports a short or mismatched new password', () => {
    component.passwordForm.setValue({
      ...component.passwordForm.getRawValue(),
      newPassword: 'short',
    });
    expect(i18n.error(component.passwordForm.controls.newPassword.errors)).toBe(
      i18n.t('errors.minLength', { requiredLength: 8 }),
    );

    component.passwordForm.setValue({
      ...component.passwordForm.getRawValue(),
      newPassword: 'formmaker',
      confirmPassword: 'different',
    });
    expect(i18n.error(component.passwordForm.errors)).toBe(i18n.t('errors.passwordMismatch'));
  });

  it('enables password saving only when all fields are valid', () => {
    expect(component.passwordForm.valid).toBeFalsy();

    component.passwordForm.setValue({
      currentPassword: 'formmaker',
      newPassword: 'newpassword',
      confirmPassword: 'newpassword',
    });
    expect(component.passwordForm.valid).toBeTruthy();
    component.passwordForm.setValue({
      ...component.passwordForm.getRawValue(),
      confirmPassword: 'nomatch',
    });
    expect(component.passwordForm.valid).toBeFalsy();
  });

  it('loads the current user into the email field', async () => {
    const users = TestBed.inject(UsersRepository) as { me: () => Promise<PublicUser> };
    users.me = () => Promise.resolve(makeUser({ email: 'changed@formmaker.local' }));
    TestBed.inject(AuthService).authenticated.set(true);

    const authFixture = TestBed.createComponent(Account);
    const authComponent = authFixture.componentInstance;
    await authFixture.whenStable();

    expect(authComponent.user()?.email).toBe('changed@formmaker.local');
    expect(authComponent.emailForm.value.email).toBe('changed@formmaker.local');
  });
});

describe('Account actions', () => {
  let fixture: ComponentFixture<Account>;
  let component: Account;
  let i18n: I18nService;
  let snack: { open: ReturnType<typeof vi.fn> };
  let users: {
    updateEmail: ReturnType<typeof vi.fn>;
    changePassword: ReturnType<typeof vi.fn>;
    deleteAccount: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    snack = { open: vi.fn() };
    users = {
      updateEmail: vi.fn(),
      changePassword: vi.fn(),
      deleteAccount: vi.fn(),
    };
    navigate = vi.fn().mockResolvedValue(true);

    await TestBed.configureTestingModule({
      imports: [Account],
      providers: [
        I18nService,
        {
          provide: UsersRepository,
          useValue: { me: () => Promise.resolve(makeUser()), ...users },
        },
        { provide: MatSnackBar, useValue: snack },
        { provide: Router, useValue: { navigate } as unknown as Router },
      ],
    }).compileComponents();

    const registry = TestBed.inject(MatIconRegistry);
    const sanitizer = TestBed.inject(DomSanitizer);
    const svg = sanitizer.bypassSecurityTrustHtml(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>',
    );
    for (const name of ICONS) registry.addSvgIconLiteral(name, svg);

    fixture = TestBed.createComponent(Account);
    component = fixture.componentInstance;
    i18n = TestBed.inject(I18nService);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  function formDir(): FormGroupDirective {
    return { resetForm: vi.fn() } as unknown as FormGroupDirective;
  }

  it('skips email saving while the form is empty', async () => {
    await component.saveEmail(formDir());
    expect(users.updateEmail).not.toHaveBeenCalled();
    expect(snack.open).not.toHaveBeenCalled();
  });

  it('saves the email, updates the user signal and confirms', async () => {
    const updated = makeUser({ email: 'new@formmaker.local' });
    users.updateEmail.mockResolvedValue(updated);
    component.emailForm.markAllAsDirty();
    component.emailForm.setValue({ email: 'new@formmaker.local', password: 'formmaker' });

    await component.saveEmail(formDir());

    expect(users.updateEmail).toHaveBeenCalledWith('new@formmaker.local', 'formmaker');
    expect(component.user()?.email).toBe('new@formmaker.local');
    expect(component.emailForm.value.email).toBe('new@formmaker.local');
    expect(snack.open).toHaveBeenCalledWith(i18n.t('account.emailSaved'), 'OK', {
      duration: 3000,
    });
  });

  it('reports a server error when the email is taken', async () => {
    users.updateEmail.mockThrow(new ApiError('email already exists', 409));
    component.emailForm.markAllAsDirty();
    component.emailForm.setValue({ email: 'taken@formmaker.local', password: 'formmaker' });

    await component.saveEmail(formDir());

    expect(component.user()?.email).toBeUndefined();
    expect(snack.open).toHaveBeenCalledWith('email already exists', 'OK', { duration: 4000 });
  });

  it('does not save a password while the form is invalid', async () => {
    component.passwordForm.setValue({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    await component.savePassword(formDir());
    expect(users.changePassword).not.toHaveBeenCalled();
  });

  it('changes the password and shows the confirmation', async () => {
    component.passwordForm.setValue({
      currentPassword: 'formmaker',
      newPassword: 'newpassword',
      confirmPassword: 'newpassword',
    });
    component.passwordForm.markAllAsDirty();
    await component.savePassword(formDir());

    expect(users.changePassword).toHaveBeenCalledWith('formmaker', 'newpassword');
    expect(snack.open).toHaveBeenCalledWith(i18n.t('account.passwordChanged'), 'OK', {
      duration: 3000,
    });
  });

  it('reports a server error when the current password is wrong', async () => {
    users.changePassword.mockRejectedValue(new ApiError('invalid password', 403));
    component.passwordForm.markAllAsDirty();
    component.passwordForm.setValue({
      currentPassword: 'wrongpassword',
      newPassword: 'newpassword',
      confirmPassword: 'newpassword',
    });

    await component.savePassword(formDir());

    expect(snack.open).toHaveBeenCalledWith('invalid password', 'OK', { duration: 4000 });
  });

  it('does not delete the account while the password field is empty', async () => {
    await component.deleteAccount();
    expect(users.deleteAccount).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('deletes the account, logs out and redirects to login', async () => {
    component.deletePassword.setValue('formmaker');
    component.deletePassword.markAllAsDirty();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    await component.deleteAccount();

    expect(users.deleteAccount).toHaveBeenCalledWith('formmaker');
    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(snack.open).toHaveBeenCalledWith(i18n.t('account.accountDeleted'), 'OK', {
      duration: 3000,
    });
  });

  it('reports a server error when deletion fails', async () => {
    users.deleteAccount.mockRejectedValue(new ApiError('invalid password', 403));
    component.deletePassword.setValue('formmaker');
    component.deletePassword.markAllAsDirty();

    await component.deleteAccount();

    expect(navigate).not.toHaveBeenCalled();
    expect(snack.open).toHaveBeenCalledWith('invalid password', 'OK', { duration: 4000 });
  });
});
