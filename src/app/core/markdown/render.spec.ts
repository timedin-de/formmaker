import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderMarkdownInline } from './render';

describe('renderMarkdownInline', () => {
  it('renders inline emphasis and code', () => {
    expect(renderMarkdownInline('**Title** and `code`')).toBe(
      '<strong>Title</strong> and <code>code</code>',
    );
  });

  it('renders autolinks for bare URLs', () => {
    expect(renderMarkdownInline('See https://example.com')).toContain('href="https://example.com"');
  });

  it('renders explicit links', () => {
    const out = renderMarkdownInline('[docs](https://example.com/docs)');
    expect(out).toContain('href="https://example.com/docs"');
    expect(out).toContain('>docs</a>');
  });

  it('does not wrap output in a paragraph', () => {
    expect(renderMarkdownInline('hello')).toBe('hello');
  });

  it('escapes raw HTML (html:false)', () => {
    expect(renderMarkdownInline('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('blocks javascript: links', () => {
    expect(renderMarkdownInline('[x](javascript:alert(1))')).not.toContain('href');
  });

  it('returns empty string for empty input', () => {
    expect(renderMarkdownInline('')).toBe('');
    expect(renderMarkdownInline(null)).toBe('');
    expect(renderMarkdownInline(undefined)).toBe('');
  });
});

describe('renderMarkdown', () => {
  it('wraps output in a paragraph', () => {
    expect(renderMarkdown('hello')).toBe('<p>hello</p>');
  });

  it('renders paragraphs, lists and headings', () => {
    const out = renderMarkdown('# Title\n\n- a\n- b');
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>a</li>');
    expect(out).toContain('<li>b</li>');
  });

  it('turns single newlines into line breaks (breaks:true)', () => {
    const out = renderMarkdown('line one\nline two');
    expect(out).toContain('line one<br>');
  });

  it('escapes raw HTML (html:false)', () => {
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).not.toContain('<img');
  });

  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown(null)).toBe('');
  });
});
