import { Component, effect, input, output, signal, viewChild } from '@angular/core';
import { ElementRef } from '@angular/core';
import SignaturePad from 'signature_pad';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { SignatureValue } from '../core/model/values.model';

@Component({
  selector: 'fm-signature-pad',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="pad-wrap" [class.touched]="drawn()">
      <canvas #canvas class="pad" (pointerup)="commit()"></canvas>
      <div class="pad-ops">
        @if (!drawn()) {
          <span class="hint">Sign above</span>
        }
        <span class="spacer"></span>
        <button mat-button type="button" (click)="clear()">
          <mat-icon>refresh</mat-icon> Clear
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .pad-wrap {
        border: 1px solid var(--mat-sys-outline);
        border-radius: 10px;
        overflow: hidden;
        background: #fff;
        width: 100%;
        max-width: 460px;
      }
      .pad-wrap.touched {
        border-color: var(--mat-sys-tertiary);
      }
      .pad {
        width: 100%;
        height: 160px;
        display: block;
        touch-action: none;
        cursor: crosshair;
        background: #fff;
      }
      .pad-ops {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .spacer {
        flex: 1;
      }
    `,
  ],
})
export class SignaturePadField {
  /** Initial value; re-seeding only happens on first render. */
  readonly initialValue = input<SignatureValue | null>(null);
  readonly write = output<SignatureValue | null>();

  protected drawn = signal(false);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private pad: SignaturePad | null = null;

  constructor() {
    effect(() => {
      const cv = this.canvas()?.nativeElement;
      if (!cv || this.pad) return;
      this.pad = new SignaturePad(cv, {
        backgroundColor: 'rgba(255,255,255,1)',
        penColor: 'rgb(28, 38, 56)',
        throttle: 16,
      });
      const initial = this.initialValue();
      if (initial?.dataUrl) {
        this.pad.fromDataURL(initial.dataUrl);
        this.drawn.set(true);
      }
    });
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
