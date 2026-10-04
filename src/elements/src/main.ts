// src/main.ts
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, ParamMap } from '@angular/router';
import { of } from 'rxjs';
import { Runner } from '../../../src/frontend/app/runner/runner';
import { provideSvgIcons } from '../../frontend/app/core/icons';
import { FormsRepository } from '../../frontend/app/core/state/forms.repository';

(async () => {
  const params: ParamMap = convertToParamMap({
    id: '488ff130-6199-430d-990f-f63c4db26102',
  });
  const app = await createApplication({
    providers: [
      {
        provide: ActivatedRoute,
        useValue: {
          queryParams: of([{ p: '' }]),
          paramMap: of(params),
        },
      },
      provideZonelessChangeDetection(),
      provideBrowserGlobalErrorListeners(),
      provideSvgIcons,
      FormsRepository,
    ],
  });

  const GreetingElement = createCustomElement(Runner, {
    injector: app.injector,
  });

  customElements.define('my-greeting', GreetingElement);
})();
