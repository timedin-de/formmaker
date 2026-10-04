// src/main.ts
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideSvgIcons } from '../../frontend/app/core/icons';
import { RunnerWrapper } from './app';

(async () => {
  const app = await createApplication({
    providers: [
      provideRouter([]),
      provideZonelessChangeDetection(),
      provideBrowserGlobalErrorListeners(),
      provideSvgIcons,
    ],
  });

  const FormMaker = createCustomElement(RunnerWrapper, {
    injector: app.injector,
  });

  customElements.define('form-maker', FormMaker);
})();
