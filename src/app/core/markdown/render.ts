import MarkdownIt from 'markdown-it';

/**
 * Shared markdown-it instance.
 * - `html: false` escapes any raw HTML instead of emitting it.
 * - `linkify: true` auto-links bare URLs in titles/descriptions.
 * - `breaks: true` turns single newlines into `<br>` for descriptions.
 * Unsafe protocols (e.g. `javascript:`) are rejected by markdown-it's built-in
 * link validation; Angular's `[innerHTML]` sanitizer is applied on top anyway.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

/** Renders a fragment (no surrounding `<p>`) — used for single-line titles/labels. */
export function renderMarkdownInline(value: string | null | undefined): string {
  const text = value ?? '';
  return text ? md.renderInline(text) : '';
}

/** Renders a full markdown document — used for multi-line descriptions/subtitles. */
export function renderMarkdown(value: string | null | undefined): string {
  const text = value ?? '';
  return text ? md.render(text).trimEnd() : '';
}
