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
      }).as('seededReadings');
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

  it('exports the `reading` field when present', () => {
    signInAndOpenDashboard([
      {
        id: 'DR-VARIANT-1',
        reading: 0.123456,
        status: 'alpha',
        recorded_by: 'Variant-tester',
        notes: 'reading key',
      },
    ]);

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1); // drop BOM
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      expect(lines[0]).to.equal('Reading,Status,Recorded By,Notes');
      // Row 1 must contain the value the `reading` field carries.
      expect(lines[1]).to.include('0.123456');
      expect(lines[1]).to.include('alpha');
      expect(lines[1]).to.include('Variant-tester');
      expect(lines[1]).to.include('reading key');
    });
  });

  it('falls back to the `value` field when `reading` is missing', () => {
    signInAndOpenDashboard([
      {
        id: 'DR-VARIANT-2',
        // `reading` is intentionally absent — pickReadingValue's
        // middle branch (`reading.value`) is the one that fires.
        value: 0.789012,
        status: 'beta',
        recorded_by: 'Variant-tester-2',
        notes: 'value key',
      },
    ]);

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1);
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      expect(lines[0]).to.equal('Reading,Status,Recorded By,Notes');
      expect(lines[1]).to.include('0.789012');
      expect(lines[1]).to.include('beta');
    });
  });

  it('emits an empty "Reading" cell when both reading and value are absent', () => {
    signInAndOpenDashboard([
      {
        id: 'DR-VARIANT-3',
        // Neither `reading` nor `value` is present — pickReadingValue
        // returns null, and the projected row's 'Reading' field is
        // '' via the `value === null || undefined` short-circuit.
        status: 'steins_gate',
        recorded_by: 'Variant-tester-3',
        notes: 'no numeric key',
      },
    ]);

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1);
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      expect(lines[0]).to.equal('Reading,Status,Recorded By,Notes');
      // Reading cell is empty. The other cells still carry data.
      expect(lines[1].startsWith(',')).to.equal(true);
      expect(lines[1]).to.include('steins_gate');
      expect(lines[1]).to.include('Variant-tester-3');
    });
  });

  it('emits empty Status / Recorded By / Notes cells when those keys are missing', () => {
    signInAndOpenDashboard([
      {
        id: 'DR-VARIANT-4',
        reading: 1.048596,
        // status, recorded_by, notes are intentionally absent —
        // the optional-chaining + nullish-coalescing branches
        // (`reading?.status ?? ''`) all fall through to ''.
      },
    ]);

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1);
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      expect(lines[0]).to.equal('Reading,Status,Recorded By,Notes');
      // Reading carries the numeric value; the three trailing
      // fields are empty. ",,," split-shape is the signature.
      expect(lines[1]).to.match(/^1\.048596,,,$/);
    });
  });

  // Note: the empty-readings-list branch of `divergenceReadingsToCsv`
  // (the `Array.isArray(rows) ? rows : []` true-on-`[]` path) is
  // exercised by the unit tests in src/utils/divergenceReadingsCsv.test.js.
  // The user-visible equivalent here is the disabled export button,
  // which `worldlineEmptyStates.cy.js` already covers. We skip the
  // e2e duplicate rather than write a non-user-reachable test.
});