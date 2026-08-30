/**
 * End-to-end coverage for the divergence-readings CSV export's
 * variant-reading branches in `src/utils/divergenceReadingsCsv.js`.
 *
 * The csvExport.cy.js suite already drives the happy path and the
 * comma/quote/newline escape branches of the export. What it doesn't
 * drive is `pickReadingValue` — the helper that pulls the raw numeric
 * reading value out of a record. That helper accepts EITHER `reading`
 * or `value` for backward compatibility, and returns `null` if both
 * are missing. The branches it has:
 *
 *   - `reading.reading` is non-null and non-undefined → return it.
 *   - `reading.value` is non-null and non-undefined (when reading is
 *     missing) → return it.
 *   - Both `reading` and `value` are null/undefined → return null
 *     (the row is exported with an empty "Reading" cell).
 *
 * And at the call site:
 *   - `value === null || undefined` → the projected row's
 *     `'Reading'` cell is the empty string.
 *   - `reading?.status ?? ''` and `reading?.recorded_by ?? ''` and
 *     `reading?.notes ?? ''` — the optional-chaining branches.
 *
 * We drive each of these by intercepting the readings endpoint with a
 * controlled body, clicking Export CSV, and asserting on the captured
 * blob's CSV payload.
 */

describe('Divergence readings CSV export — pickReadingValue variants', () => {
  let capture;

  // Install the same Blob/URL spies csvExport.cy.js uses so we can
  // assert on the produced CSV text. MUST be called AFTER the page
  // has loaded so the spies survive the cy.visit() window swap.
  const installDownloadSpy = () => {
    capture = { blobs: [] };
    cy.window().then((win) => {
      const OriginalBlob = win.Blob;
      function WrappedBlob(parts, options) {
        const instance = new OriginalBlob(parts, options);
        try {
          instance.__rawParts = Array.isArray(parts) ? parts.slice() : [parts];
          instance.__options = options;
        } catch (e) {
          // Some Blob implementations are non-extensible; skip capture.
        }
        return instance;
      }
      WrappedBlob.prototype = OriginalBlob.prototype;
      Object.setPrototypeOf(WrappedBlob, OriginalBlob);
      Object.defineProperty(WrappedBlob, 'name', { value: 'Blob' });
      win.Blob = WrappedBlob;

      win.URL.createObjectURL = (blob) => {
        capture.blobs.push(blob);
        return 'blob:cypress-csv-variants';
      };
      win.URL.revokeObjectURL = () => {};
    });
  };

  // Read the CSV text out of a captured blob.
  const blobToCsv = (blob) => {
    if (blob && Array.isArray(blob.__rawParts)) {
      return blob.__rawParts.join('');
    }
    if (blob && typeof blob.text === 'function') {
      return blob.text();
    }
    return '';
  };

  // Sign in + drive to the dashboard so the WorldlineMonitor mounts,
  // then install the download spy so handleExportReadingsCsv's
  // production downloadCsv path can run end-to-end against our stubs.
  const signInAndOpenDashboard = (interceptBody) => {
    if (interceptBody) {
      cy.intercept('GET', '**/future-gadget-lab/divergence-readings', {
        statusCode: 200,
        body: interceptBody,
      }).as('variantReadings');
    }
    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="worldline-container"]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="readings-table"]', { timeout: 15000 }).should('be.visible');
    installDownloadSpy();
  };

  it('exports a reading from the `reading` field when both `reading` and `value` are present', () => {
    signInAndOpenDashboard([
      {
        id: 'DR-100',
        reading: 1.048596,
        value: 99.9, // sentinel: if pickReadingValue picks this, the test will fail
        status: 'steins_gate',
        recorded_by: 'Okabe Rintaro',
        notes: 'Convergence achieved'
      }
    ]);

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1); // drop BOM
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      // Header + one row.
      expect(lines).to.have.length(2);
      expect(lines[0]).to.equal('Reading,Status,Recorded By,Notes');
      // The "Reading" column carries `reading` (1.048596), not `value`
      // (99.9). pickReadingValue prefers `reading` when present.
      expect(lines[1].startsWith('1.048596,')).to.equal(true);
      expect(lines[1]).to.not.include('99.9');
    });
  });

  it('falls back to the `value` field when `reading` is missing', () => {
    // Newer backend shape: only the `value` field is set.
    signInAndOpenDashboard([
      {
        id: 'DR-101',
        // reading: omitted entirely
        value: 0.571024,
        status: 'alpha',
        recorded_by: 'Mayuri Shiina',
        notes: 'No convergence'
      }
    ]);

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1);
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      expect(lines).to.have.length(2);
      // Falls back to value: 0.571024
      expect(lines[1].startsWith('0.571024,')).to.equal(true);
    });
  });

  it('renders an empty Reading cell when both `reading` and `value` are null', () => {
    // Both fields missing — pickReadingValue returns null. The
    // projection renders '' for the Reading column. The row is still
    // exported (with empty Status/Recorded By/Notes when those are
    // also missing), which is what the existing dashboard.cy.js
    // "no readings" branch doesn't exercise because it asserts on
    // the disabled state instead of an export.
    signInAndOpenDashboard([
      {
        id: 'DR-102',
        reading: null,
        value: null,
        status: null,
        recorded_by: null,
        notes: null
      }
    ]);

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1);
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      // Header + one row with empty fields. Empty fields joined
      // by commas are just `,,,` separators.
      expect(lines).to.have.length(2);
      expect(lines[0]).to.equal('Reading,Status,Recorded By,Notes');
      // Empty Reading cell → the row starts with a comma.
      expect(lines[1].startsWith(',')).to.equal(true);
      expect(lines[1]).to.equal(',,,');
    });
  });

  it('handles a reading whose notes field contains a comma (escape branch in rowsToCsv)', () => {
    // Notes containing a comma forces the escapeCsvField quoting
    // path even when the field is otherwise straightforward. This
    // is a tighter version of the existing csvExport.cy.js escape
    // test, with the escape triggered by the notes column alone.
    signInAndOpenDashboard([
      {
        id: 'DR-103',
        reading: 1.0,
        status: 'beta',
        recorded_by: 'Hashida Itaru',
        notes: 'Suzuha, Amane'
      }
    ]);

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1);
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      expect(lines).to.have.length(2);
      // The Notes column must be wrapped in double-quotes because the
      // value contains a comma. The other columns are unquoted.
      expect(lines[1]).to.include('1,beta,Hashida Itaru,"Suzuha, Amane"');
    });
  });
});