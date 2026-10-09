import { type TestBedStatic } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { ICON_NAMES } from '../../src/frontend/app/core/icon-names';

export function initRegistry(TestBed: TestBedStatic) {
  const registry = TestBed.inject(MatIconRegistry);
  const sanitizer = TestBed.inject(DomSanitizer);
  const svg = sanitizer.bypassSecurityTrustHtml(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>',
  );
  for (const name of ICON_NAMES) registry.addSvgIconLiteral(name, svg);
}
