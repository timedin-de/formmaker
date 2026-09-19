import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function fieldMatchValidator(field1: string, field2: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const password = control.get(field1);
    const passwordConfirm = control.get(field2);

    if (!password?.value || !passwordConfirm?.value) {
      return null;
    }

    return password.value === passwordConfirm.value ? null : { passwordMismatch: true };
  };
}
