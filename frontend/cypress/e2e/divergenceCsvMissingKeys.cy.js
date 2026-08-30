/**
 * End-to-end coverage for the remaining branches in
 * `src/utils/divergenceReadingsCsv.js` that the other CSV specs
 * do not yet reach:
 *
 *   - `pickReadingValue` line 40 (`return null`) when the record
 *     exists but NEITHER `reading` NOR `value` is present.
 *   - The export continues to work end-to-end even when every row
 *     in the readings table is a "shell" record with no numeric
 *     fields.
 *
 * Drives the falsy `recorded_by` / `status` / `notes` paths in
 * the optional-chaining + nullish-coalescing branch
 * (`reading?.status ?? ''`). A record whose only key is `id`
 * exercises all three simultaneously (none of them are present,
 * so the `??` fallback to '' fires for each).
 *
 * Acceptance: this is a user-observable behaviour — the user clicks
 * "Export CSV" on a dashboard whose readings table contains only
 * shell rows (e.g. a freshly paired divergence meter with no
 * measurements yet), and the downloaded CSV must still open cleanly
 * in Excel with the right header row.
 */

describe('Divergence readings CSV export — records with neither reading nor value key', () => {
  let capture;

  // Same Blob/URL spy as divergenceCsvVariants.cy.js. We do NOT
  // wrap document.createElement here because the assertion only
  // needs to read the captured blob text; we don't care about the
  // <a download> click target.
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
        return 'blob:cypress-csv-missing';
      };
      win.URL.revokeObjectURL = () => {};
    });
  };

  const blobToCsv = (blob) => {
    if (blob && Array.isArray(blob.__rawParts)) {
      return blob.__rawParts.join('');
    }
    if (blob && typeof blob.text === 'function') {
      return blob.text();
    }
    return '';
  };

  const signInAndOpenDashboard = (interceptBody) => {
    cy.intercept('GET', '**/future-gadget-lab/divergence-readings', {
      statusCode: 200,
      body: interceptBody,
    }).as('seededMissingKeys');

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

  it('exports shell rows (only `id`) with empty numeric / status / recorded_by / notes cells', () => {
    signInAndOpenDashboard([
      {
        id: 'SHELL-ROW-1',
        // reading, value, status, recorded_by, notes intentionally
        // omitted. pickReadingValue returns null on line 40; the
        // optional-chaining branches all fall through to ''.
      },
      {
        id: 'SHELL-ROW-2',
        // Same — exercises the per-row branch twice so we get
        // multiple "" cells in the output.
      },
    ]);

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1);
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      // Header + 2 shell rows. Each shell row is four empty cells
      // separated by commas — that's the user-visible shape of an
      // empty-from-everywhere export.
      expect(lines).to.have.length(3);
      expect(lines[0]).to.equal('Reading,Status,Recorded By,Notes');
      expect(lines[1]).to.equal(',,,');
      expect(lines[2]).to.equal(',,,');
    });
  });

  it('exports a single shell row mixed with a normal row', () => {
    // Mixed payload — one normal row sandwiched between two
    // shell rows. Verifies that the row-by-row fall-through to ''
    // does not break the surrounding rows' normal handling.
    signInAndOpenDashboard([
      { id: 'SHELL-A' },
      {
        id: 'NORMAL-MIDDLE',
        reading: 0.409824,
        status: 'delta',
        recorded_by: 'Mid-tester',
        notes: 'normal',
      },
      { id: 'SHELL-B' },
    ]);

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1);
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      expect(lines).to.have.length(4);
      expect(lines[0]).to.equal('Reading,Status,Recorded By,Notes');
      expect(lines[1]).to.equal(',,,');
      expect(lines[2]).to.include('0.409824');
      expect(lines[2]).to.include('delta');
      expect(lines[3]).to.equal(',,,');
    });
  });

  it('emits a row whose notes contain only whitespace (still exported as-is)', () => {
    // Drive the `reading?.notes ?? ''` short-circuit when notes
    // is the empty string ('') instead of null/undefined. Empty
    // string is NOT nullish — it survives the optional chaining
    // and lands in the projected row verbatim.
    signInAndOpenDashboard([
      {
        id: 'WHITESPACE-ROW',
        reading: 0.000001,
        status: 'omega',
        recorded_by: ' ',
        notes: '',
      },
    ]);

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1);
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      expect(lines).to.have.length(2);
      // The single space in recorded_by is the falsy-string branch.
      // Empty notes are NOT missing — they get written verbatim.
      expect(lines[1]).to.include('0.000001');
      expect(lines[1]).to.include('omega');
      // Row shape: '0.000001,omega, ,' — 4 fields, with the trailing
      // empty notes field. Allow for either a trailing CRLF artefact
      // or the natural trailing-comma shape.
      expect(lines[1]).to.match(/^0\.000001,omega, ,$/);
    });
  });
});