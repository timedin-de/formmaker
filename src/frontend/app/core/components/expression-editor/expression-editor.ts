import {
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
  type ElementRef,
  type Signal,
} from '@angular/core';
import { NgControl } from '@angular/forms';
import { MatFormFieldControl } from '@angular/material/form-field';
import { MatTooltip } from '@angular/material/tooltip';
import { FUNCTION_NAMES } from '@shared/engine';
import { isQuestion } from '@shared/helper';
import { type FormDefinition } from '@shared/model';
import { type Observable } from 'rxjs';
import { I18nService } from '../../i18n';

const VAR_PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;
/** An unfinished `{{query` directly before the caret. */
const OPEN_VAR_PATTERN = /\{\{\s*([^{}\s]*)$/;
/** A bare word directly before the caret, i.e. a function name being typed. */
const OPEN_FUNCTION_PATTERN = /(?:^|[^\w.{}'"])([A-Za-z]\w*)$/;
/** String literals (skipped) or a name directly followed by `(`. */
const CALL_PATTERN = /'(?:\\.|[^'\\])*'?|"(?:\\.|[^"\\])*"?|\b([A-Za-z]\w*)(?=\s*\()/g;
const FUNCTIONS = new Set(FUNCTION_NAMES.map((name) => name.toLowerCase()));
const MAX_SUGGESTIONS = 8;

type Token =
  | { kind: 'text' | 'fn'; text: string }
  | { kind: 'var'; text: string; source: string };

interface Suggest {
  /** `{{` opens question suggestions, a bare word function suggestions. */
  kind: 'question' | 'function';
  /** Text typed after `{{`, or the word typed so far. */
  query: string;
  /** Length of the text before the caret that is replaced on pick. */
  length: number;
  top: number;
  left: number;
}

interface Suggestion {
  /** Text inserted on pick, without the caret placement. */
  key: string;
  label: string;
  tooltip: string;
}

@Component({
  selector: 'fm-expression-editor',
  styleUrl: './expression-editor.scss',
  templateUrl: './expression-editor.html',
  providers: [
    {
      provide: MatFormFieldControl,
      useExisting: ExpressionEditor,
    },
    { provide: NgControl, useExisting: forwardRef(() => ExpressionEditor) },
  ],
  imports: [MatTooltip],
})
export class ExpressionEditor implements MatFormFieldControl<string> {
  ngControl = null;
  static nextId = 0;
  readonly id = `custom-control-${ExpressionEditor.nextId++}`;
  readonly focused = signal<boolean>(false);
  readonly empty = computed(() => !this.value().length);
  readonly shouldLabelFloat = computed(() => this.focused() || !this.empty());
  readonly required = input(false);
  readonly errorState = signal(false);
  readonly disabled = input(false);
  readonly value = input<string>('');
  readonly valueChange = output<string>();

  readonly form = input.required<FormDefinition>();
  readonly fields = computed(() => this.form().elements);

  protected readonly listboxId = `${this.id}-suggestions`;
  protected readonly suggest = signal<Suggest | null>(null);
  protected readonly activeIndex = signal(0);
  protected readonly suggestions = computed<Suggestion[]>(() => {
    const suggest = this.suggest();
    if (!suggest) return [];
    const query = suggest.query.toLowerCase();
    const items: Suggestion[] =
      suggest.kind === 'question'
        ? Object.values(this.fields())
            .filter(isQuestion)
            .filter(
              (q) =>
                q.id.toLowerCase().startsWith(query) || q.label.toLowerCase().startsWith(query),
            )
            .map((q) => ({ key: q.id, label: q.label, tooltip: q.id }))
        : FUNCTION_NAMES.filter((name) => name.toLowerCase().startsWith(query)).map((name) => ({
            key: name,
            label: `${name}()`,
            tooltip: name,
          }));
    return items.slice(0, MAX_SUGGESTIONS);
  });

  controlType?: string | undefined;
  autofilled?: boolean | Signal<boolean> | undefined;
  userAriaDescribedBy?: string | Signal<string> | undefined;
  disableAutomaticLabeling?: boolean | undefined;
  stateChanges?: Observable<void> | null | undefined;

  get describedByIds() {
    return this.describedByIdsS();
  }

  readonly textContainer = viewChild<ElementRef<HTMLElement>>('text');
  protected readonly describedByIdsS = signal<string[]>([]);

  constructor() {
    // Re-render on external value / field changes. The text the user is typing already matches
    // the DOM, so it's skipped to keep the caret where it is.
    effect(() => {
      const host = this.textContainer()?.nativeElement;
      const value = this.value();
      this.fields();
      if (host && serialize(host) !== value) this.render(host, value);
    });
  }

  setDescribedByIds(ids: string[]): void {
    this.describedByIdsS.set(ids);
  }
  onContainerClick(_event: MouseEvent): void {
    this.textContainer()?.nativeElement.focus();
  }

  protected onInput(): void {
    const host = this.textContainer()?.nativeElement;
    if (!host) return;
    const value = serialize(host);
    // Re-render only when chips or function highlights no longer match the text.
    if (this.needsRender(host, value)) {
      const caret = caretOffset(host);
      this.render(host, value);
      if (caret !== null) placeCaret(host, caret);
    }
    this.valueChange.emit(value);
    this.updateSuggest(host);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.suggestions().length;
    if (!count) return;
    switch (event.key) {
      case 'ArrowDown':
        this.activeIndex.update((i) => (i + 1) % count);
        break;
      case 'ArrowUp':
        this.activeIndex.update((i) => (i - 1 + count) % count);
        break;
      case 'Enter':
      case 'Tab':
        this.pick(this.suggestions()[this.activeIndex()].key);
        break;
      case 'Escape':
        this.suggest.set(null);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  protected onBlur(): void {
    this.focused.set(false);
    //this.suggest.set(null);
  }

  /**
   * Replace the open `{{query` before the caret with a chip for the question `key`, or the typed
   * word with a `key()` call, leaving the caret between the parentheses.
   */
  protected pick(key: string): void {
    const host = this.textContainer()?.nativeElement;
    const suggest = this.suggest();
    const caret = host && caretOffset(host);
    if (!host || !suggest || caret == null) return;
    const value = serialize(host);
    const isQuestion = suggest.kind === 'question';
    const token = isQuestion ? `{{${key}}}` : `${key}()`;
    const start = caret - suggest.length;
    const next = value.slice(0, start) + token + value.slice(caret);
    this.render(host, next);
    placeCaret(host, start + token.length - (isQuestion ? 0 : 1));
    this.suggest.set(null);
    this.valueChange.emit(next);
  }

  private updateSuggest(host: HTMLElement): void {
    const selection = host.ownerDocument.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    const node = range?.endContainer;
    const before =
      range?.collapsed && node?.nodeType === Node.TEXT_NODE && host.contains(node)
        ? (node.textContent ?? '').slice(0, range.endOffset)
        : null;
    const varMatch = before?.match(OPEN_VAR_PATTERN);
    const functionMatch =
      before && !varMatch && !inStringLiteral(before) ? before.match(OPEN_FUNCTION_PATTERN) : null;
    const match = varMatch ?? functionMatch;
    if (!range || !match) {
      this.suggest.set(null);
      return;
    }
    // A collapsed range has no box in some browsers right after a line break; fall back to the host.
    const caretRect = range.getBoundingClientRect?.();
    const rect = caretRect?.height ? caretRect : host.getBoundingClientRect();
    this.suggest.set({
      kind: varMatch ? 'question' : 'function',
      query: match[1],
      // The function pattern may include the preceding delimiter, which stays in place.
      length: varMatch ? match[0].length : match[1].length,
      top: rect.bottom,
      left: rect.left,
    });
    this.activeIndex.set(0);
  }

  private needsRender(host: HTMLElement, value: string): boolean {
    const tokens = this.tokenize(value);
    const nodes = host.childNodes;
    return (
      tokens.length !== nodes.length ||
      tokens.some((token, i) => {
        const node = nodes[i];
        if (token.kind === 'text') return node.nodeType !== Node.TEXT_NODE;
        if (!(node instanceof HTMLElement) || !node.classList.contains(token.kind)) return true;
        return token.kind === 'fn' && node.textContent !== token.text;
      })
    );
  }

  /** Split `value` into plain text, question chips and highlighted function names. */
  private tokenize(value: string): Token[] {
    const fields = this.fields();
    const tokens: Token[] = [];
    const pushText = (text: string) => {
      let last = 0;
      for (const match of text.matchAll(CALL_PATTERN)) {
        if (!match[1] || !FUNCTIONS.has(match[1].toLowerCase())) continue;
        if (match.index > last) tokens.push({ kind: 'text', text: text.slice(last, match.index) });
        tokens.push({ kind: 'fn', text: match[1] });
        last = match.index + match[1].length;
      }
      if (last < text.length) tokens.push({ kind: 'text', text: text.slice(last) });
    };
    let last = 0;
    for (const match of value.matchAll(VAR_PATTERN)) {
      if (!Object.hasOwn(fields, match[1])) continue;
      pushText(value.slice(last, match.index));
      tokens.push({ kind: 'var', text: fields[match[1]].label, source: match[0] });
      last = match.index + match[0].length;
    }
    pushText(value.slice(last));
    return tokens;
  }

  private render(host: HTMLElement, value: string): void {
    const nodes = this.tokenize(value).map((token) => {
      if (token.kind === 'text') return document.createTextNode(token.text);
      const span = document.createElement('span');
      span.className = token.kind;
      span.textContent = token.text;
      if (token.kind === 'var') {
        span.contentEditable = 'false';
        span.dataset['source'] = token.source;
      }
      return span;
    });
    host.replaceChildren(...nodes);
  }

  protected readonly i18n = inject(I18nService);
}

/** Model text of a node: chips contribute their `{{id}}` source, everything else its text. */
function serialize(node: Node): string {
  if (node instanceof HTMLElement && node.classList.contains('var')) {
    return node.dataset['source'] ?? '';
  }
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof HTMLBRElement) return '';
  let text = '';
  for (const child of node.childNodes) text += serialize(child);
  return text;
}

/** Whether the end of `text` sits inside an unterminated '…' or "…" literal. */
function inStringLiteral(text: string): boolean {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote && ch === '\\') i++;
    else if (ch === quote) quote = null;
    else if (!quote && (ch === "'" || ch === '"')) quote = ch;
  }
  return quote !== null;
}

/** Caret position within `host`, measured in serialized (model) characters. */
function caretOffset(host: HTMLElement): number | null {
  const selection = host.ownerDocument.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!host.contains(range.endContainer)) return null;
  const before = host.ownerDocument.createRange();
  before.selectNodeContents(host);
  before.setEnd(range.endContainer, range.endOffset);
  return serialize(before.cloneContents()).length;
}

/** Put the caret at a serialized offset; an offset inside or at the end of a chip lands after it. */
function placeCaret(host: HTMLElement, offset: number): void {
  const range = host.ownerDocument.createRange();
  let remaining = offset;
  let placed = false;
  for (const child of host.childNodes) {
    const length = serialize(child).length;
    if (remaining <= length) {
      const isChip = child instanceof HTMLElement && child.classList.contains('var');
      // Function highlights are editable text; the caret goes into their text node.
      const text = child.nodeType === Node.TEXT_NODE ? child : isChip ? null : child.firstChild;
      if (text) range.setStart(text, remaining);
      else if (remaining === 0) range.setStartBefore(child);
      else range.setStartAfter(child);
      placed = true;
      break;
    }
    remaining -= length;
  }
  if (!placed) {
    range.selectNodeContents(host);
    range.collapse(false);
  }
  range.collapse(true);
  const selection = host.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
