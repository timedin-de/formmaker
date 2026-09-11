import { APP_INITIALIZER, Provider } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { ICON_NAMES } from './icon-names';

export const provideSvgIcons: Provider = {
  provide: APP_INITIALIZER,
  useFactory: (registry: MatIconRegistry, sanitizer: DomSanitizer) => () => {
    for (const name of ICON_NAMES) {
      registry.addSvgIcon(
        name,
        sanitizer.bypassSecurityTrustResourceUrl(`assets/icons/${name}.svg`),
      );
    }
  },
  deps: [MatIconRegistry, DomSanitizer],
  multi: true,
};
