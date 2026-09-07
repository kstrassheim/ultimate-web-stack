// Issue #155: defense-in-depth HTML escape for strings that get
// interpolated into a template literal and then handed to a DOM writer
// that bypasses React (here: ApexCharts' `tooltip.custom` callback).
// React's own JSX escaping only protects values that flow through React;
// once the value leaves React's tree as part of an HTML string, the
// caller is responsible for escaping, otherwise a stored XSS on a
// string field becomes a stored XSS in the rendered DOM.
//
// Keep this list conservative: only the five characters that have HTML
// special meaning inside text content and inside double- or single-
// quoted attribute values. ApexCharts writes the tooltip string into
// the document as HTML, so we treat the result as a TEXT NODE
// payload — no attribute-value context is needed, but the five
// characters below cover both contexts and stay symmetric with OWASP
// guidance.
const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const ESCAPE_PATTERN = /[&<>"']/g;

/**
 * Escape characters that have HTML special meaning so the result is
 * safe to interpolate into an HTML string before it is written to the
 * DOM.
 *
 * - `null` and `undefined` collapse to the empty string (so a missing
 *   record field renders as nothing rather than the literal "null" /
 *   "undefined").
 * - Non-string scalars (numbers, booleans, Dates, ...) are coerced via
 *   `String(...)` — Dates become their `toString()` form, which is fine
 *   here because dates are not user-controlled HTML.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const escapeHtml = (value) => {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  return str.replace(ESCAPE_PATTERN, (c) => ESCAPE_MAP[c]);
};
