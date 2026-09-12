import { Pipe, PipeTransform } from '@angular/core';
import { renderMarkdown, renderMarkdownInline } from './render';

@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined, block = false): string {
    return block ? renderMarkdown(value) : renderMarkdownInline(value);
  }
}
