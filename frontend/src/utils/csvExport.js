/**
 * CSV export utilities.
 *
 * Pure, side-effect-free serializers for turning structured rows into an
 * RFC 4180-style CSV string, plus a tiny browser download helper. Kept
 * separate from the React components so the escape rules are easy to unit
 * test in isolation and so the same helpers can be reused for other
 * tables in the future.
 */

/**
 * Escape a single field for CSV output per RFC 4180.
 *
 * - null / undefined are rendered as the empty string.
 * - Non-string values are coerced via String() so the caller can pass
 *   numbers, booleans, etc. without thinking about it.
 * - Fields containing a comma, double quote, CR or LF are wrapped in
 *   double quotes.
 * - Internal double quotes are escaped by doubling them (`"` -> `""`).
 *
 * @param {*} value Field value of any type.
 * @returns {string} Escaped CSV field, without the surrounding field
 *   separator (the caller adds the comma or line break).
 */
export const escapeCsvField = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  // String() handles numbers, booleans, dates etc. consistently.
  let str;
  if (value instanceof Date) {
    str = value.toISOString();
  } else {
    str = String(value);
  }

  const needsQuoting = /[",\r\n]/.test(str);
  if (!needsQuoting) {
    return str;
  }

  return `"${str.replace(/"/g, '""')}"`;
};

/**
 * Build a CSV string from a list of column headers and an array of row
 * objects.
 *
 * Each row is serialised in the order of `headers`. Missing or
 * undefined fields render as the empty string. Uses CRLF line endings
 * (RFC 4180 default) so tools like Microsoft Excel on Windows open
 * the file without complaints.
 *
 * @param {string[]} headers Column header names, in the order they
 *   should appear in the output.
 * @param {Array<object>} rows Row objects keyed by header name.
 * @returns {string} The full CSV document including the header row.
 */
export const rowsToCsv = (headers, rows) => {
  const headerLine = headers.map(escapeCsvField).join(',');
  const bodyLines = rows.map((row) =>
    headers.map((h) => escapeCsvField(row?.[h])).join(',')
  );
  return [headerLine, ...bodyLines].join('\r\n') + '\r\n';
};

/**
 * Trigger a browser download of the given CSV text.
 *
 * Creates a Blob URL, attaches it to a temporary `<a download>`
 * element long enough to dispatch the click, and revokes the URL.
 * The attach/detach dance is defensive: modern browsers honour the
 * `download` attribute on a detached element, but a few older
 * browsers silently drop the click on a detached anchor. The cost
 * is two DOM mutations per export, which is negligible compared to
 * the work the rest of the function already does. The download
 * itself runs asynchronously; the function returns as soon as the
 * click has been dispatched.
 *
 * Safe to call only in the browser. In non-browser environments
 * (e.g. jsdom in some configurations) `URL.createObjectURL` is
 * available but no actual download happens; the tests in this repo
 * stub `URL.createObjectURL` and `document.createElement` to assert
 * on the inputs.
 *
 * @param {string} filename Suggested filename for the download.
 * @param {string} csvText CSV document text (UTF-8).
 */
export const downloadCsv = (filename, csvText) => {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    // Not a browser environment — nothing to do.
    return;
  }

  // BOM so Excel detects UTF-8 correctly when the CSV contains
  // non-ASCII characters (e.g. names like "Suzuha Amane").
  const blob = new Blob(['\uFEFF', csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  // Defensive attach so the click is honoured on every browser
  // that ever shipped a download attribute. Removed again before
  // this function returns so no extra node lingers in the DOM.
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
