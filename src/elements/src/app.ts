import { Component, ElementRef, inject } from '@angular/core';
import { API_BASE_URL, ApiClient } from '../../frontend/app/core/state/api-client';
import { FormsRepository } from '../../frontend/app/core/state/forms.repository';
import { Runner } from '../../frontend/app/runner-page/runner/runner';

function hostData(key: 'formId' | 'apiUrl'): string | null {
  return (inject(ElementRef).nativeElement as HTMLElement).dataset[key] ?? null;
}

/**
 * `<form-maker data-form-id="…" data-api-url="…">`: the runner as a custom element.
 * The API client and repository are scoped to each element so `data-api-url` applies to it.
 */
@Component({
  imports: [Runner],
  template: '<fm-runner [formId]="formId"></fm-runner>',
  providers: [
    { provide: API_BASE_URL, useFactory: () => hostData('apiUrl') ?? '' },
    ApiClient,
    FormsRepository,
  ],
  styleUrl: './app.scss',
})
export class RunnerWrapper {
  protected readonly formId = hostData('formId');
}
