import { Component, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { ElementRef, OnDestroy } from '@angular/core';
import SignaturePad from 'signature_pad';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { SignatureValue } from '../shared/model/values.model';
import { I18nService } from '../core/i18n';

@Component({
  selector: 'fm-signature-pad',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './signature-pad.html',
  styleUrl: './signature-pad.scss',
})
export class SignaturePadField implements OnDestroy {
  /** Initial value; re-seeding only happens on first render. */
  readonly initialValue = input<SignatureValue | null>(null);
  readonly write = output<SignatureValue | null>();
  protected readonly i18n = inject(I18nService);

  protected drawn = signal(false);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private pad: SignaturePad | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      const cv = this.canvas()?.nativeElement;
      if (!cv || this.pad) return;
      this.pad = new SignaturePad(cv, this.penOptions());
      this.syncSize(cv);
      const initial = this.initialValue();
      if (initial?.dataUrl) {
        this.pad.fromDataURL(initial.dataUrl);
        this.drawn.set(true);
      }
      this.resizeObserver = new ResizeObserver(() => this.recreate(cv));
      this.resizeObserver.observe(cv);
    });
  }

  private penOptions(): ConstructorParameters<typeof SignaturePad>[1] {
    return {
      backgroundColor: 'rgba(255,255,255,1)',
      penColor: 'rgb(28, 38, 56)',
      throttle: 16,
      dotSize: 0,
    };
  }

  private syncSize(cv: HTMLCanvasElement): void {
    if (cv.clientWidth > 0) cv.width = cv.clientWidth;
    if (cv.clientHeight > 0) cv.height = cv.clientHeight;
  }

  private recreate(cv: HTMLCanvasElement): void {
    if (!this.pad) return;
    const previous: SignatureValue | null = this.pad.isEmpty()
      ? null
      : {
          dataUrl: this.pad.toDataURL('image/png'),
          width: cv.width,
          height: cv.height,
          mimeType: 'image/png',
        };
    this.pad.off();
    this.pad = null;
    this.syncSize(cv);
    this.pad = new SignaturePad(cv, this.penOptions());
    if (previous) {
      void this.pad.fromDataURL(previous.dataUrl);
      this.drawn.set(true);
    } else {
      this.drawn.set(false);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.pad?.off();
    this.pad = null;
  }

  /** Called from the template on pointerup / end-of-stroke. */
  commit(): void {
    if (!this.pad) return;
    const isEmpty = !this.pad.toData().length || this.pad.isEmpty();
    if (isEmpty) {
      this.drawn.set(false);
      this.write.emit(null);
      return;
    }
    this.drawn.set(true);
    const canvas = this.canvas()?.nativeElement as HTMLCanvasElement | undefined;
    this.write.emit({
      dataUrl: this.pad.toDataURL('image/png'),
      width: canvas?.width ?? 0,
      height: canvas?.height ?? 0,
      mimeType: 'image/png',
    });
  }

  clear(): void {
    this.pad?.clear();
    this.drawn.set(false);
    this.write.emit(null);
  }
}
