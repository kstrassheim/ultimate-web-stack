/**
 * Divergence-readings-specific CSV builder.
 *
 * Owns the column shape of the "Divergence Meter Readings" table
 * export so the React component doesn't have to know the header
 * order, what to call each column, or how to coerce the underlying
 * reading number to a string.
 *
 * The exported rows respect whatever filter / sort state the calling
 * component already applied — this function does NOT re-filter. The
 * caller is expected to pass the rows in the order the user sees
 * them in the table.
 */

import { rowsToCsv } from './csvExport';

// Column shape of the readings table, in the order the user sees
// them on screen. Header text matches the `<th>` strings in
// WorldlineMonitor.jsx so the CSV is recognisable.
export const DIVERGENCE_READINGS_CSV_COLUMNS = [
  'Reading',
  'Status',
  'Recorded By',
  'Notes'
];

/**
 * Pick the raw numeric reading value from a divergence readings
 * record, accepting either `reading` or `value` for backward
 * compatibility with both old and new backend shapes.
 */
const pickReadingValue = (reading) => {
  if (reading === null || reading === undefined) return null;
  if (reading.reading !== null && reading.reading !== undefined) {
    return reading.reading;
  }
  if (reading.value !== null && reading.value !== undefined) {
    return reading.value;
  }
  return null;
};

/**
 * Build a CSV string for the divergence meter readings table.
 *
 * - `rows` is the list of readings to export, already filtered /
 *   sorted by the caller.
 * - The output is RFC 4180-compliant and uses CRLF line endings
 *   so it opens cleanly in Excel.
 * - Header names match the on-screen table columns.
 * - Fields containing commas, quotes, or newlines are escaped by
 *   the underlying rowsToCsv helper.
 *
 * @param {Array<object>} rows Filtered, sorted divergence readings.
 * @returns {string} CSV document text.
 */
export const divergenceReadingsToCsv = (rows) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const projected = safeRows.map((reading) => {
    const value = pickReadingValue(reading);
    return {
      'Reading': value === null || value === undefined ? '' : value,
      'Status': reading?.status ?? '',
      'Recorded By': reading?.recorded_by ?? '',
      'Notes': reading?.notes ?? ''
    };
  });
  return rowsToCsv(DIVERGENCE_READINGS_CSV_COLUMNS, projected);
};

/**
 * Suggest a filename for a divergence-readings CSV download.
 *
 * The date in the filename is the local calendar date so users can
 * tell at a glance which export they're looking at. Format is the
 * ISO 8601 short form `YYYY-MM-DD` for filesystem compatibility.
 *
 * @param {Date} [now] Override for the current date — exposed for
 *   deterministic testing.
 * @returns {string} Filename like `divergence-readings-2025-04-07.csv`.
 */
export const divergenceReadingsCsvFilename = (now = new Date()) => {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `divergence-readings-${yyyy}-${mm}-${dd}.csv`;
};
