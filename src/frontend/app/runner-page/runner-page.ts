import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { Runner } from './runner/runner';

@Component({
  template: '<fm-runner [formId]="formId | async"></fm-runner>',
  imports: [Runner, AsyncPipe],
})
export class RunnerPage {
  private readonly route = inject(ActivatedRoute);
  readonly formId = this.route.paramMap.pipe(map((p) => p.get('id')));
}
