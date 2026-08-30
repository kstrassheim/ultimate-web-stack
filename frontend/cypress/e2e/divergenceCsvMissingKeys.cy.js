/**
 * End-to-end coverage for the remaining branches in
 * `src/utils/divergenceReadingsCsv.js` that `divergenceCsvVariants.cy.js`
 * does not yet reach:
 *
 *   - `pickReadingValue` line 40 (`return null`) when the record exists
 *     but NEITHER `reading` NOR `value` is present. The existing suite
 *     drives the `reading: null, value: null` case (which short-circuits
 *     on the first `if (reading === null ...)` guard) but never the
 *     case where the keys are entirely absent — that is what falls
 *     through to line 40.
 *   - The export continues to work end-to-end even when every row in
 *     the readings table is a "shell" record with no numeric fields.
 *     This is the realistic shape of an empty / new device.
 *
 * We also drive the falsy `recorded_by` / `status` / `notes` paths in
 * the optional-chaining + nullish-coalescing branch (`reading?.status ?? ''`).
 * A record whose only key is `id` exercises all three simultaneously
 * (none of them are present, so the `??` fallback to '' fires for
 * each).
 *
 * Acceptance: this is a user-observable behaviour — the user clicks
 * "Export CSV" on a dashboard whose readings table contains only
 * shell rows (e.g. a freshly paired divergence meter with no
 * measurements yet), and the downloaded CSV must still open cleanly
 * in Excel with the right header row.
 */

describe('Divergence readings CSV export — records with neither reading nor value key', () => {
  let capture;

  // Same Blob/URL spy as divergenceCsvVariants.cy.js. We do NOT wrap
  // document.createElement here because the assertion only needs to
  // read the captured blob text; we don't care about the <a download>
  // click target.
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

  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });

    cy.window().then((win) => {
      win.localStorage.clear();
      win.sessionStorage.clear();
    });
  });

  it('exports a CSV with empty Reading cells when no record has either `reading` or `value`', () => {
    // Drive the divergence-readings endpoint with shell records.
    // Each record has only `id` — no `reading`, no `value`, no `status`,
    // no `recorded_by`, no `notes`. `pickReadingValue` walks past both
    // guards and returns null on line 40; the projection maps that to
    // '' via the `value === null || value === undefined ? '' : value`
    // branch in divergenceReadingsToCsv.
    cy.intercept('GET', '**/future-gadget-lab/divergence-readings', {
      statusCode: 200,
      body: [
        { id: 'DR-200' },
        { id: 'DR-201' },
        { id: 'DR-202' },
      ],
    }).as('shellReadings');

    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="worldline-container"]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="readings-table"]', { timeout: 15000 }).should('be.visible');
    installDownloadSpy();

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1); // drop BOM
      const lines = csv.split('\r\n').filter((line) => line.length > 0);

      // Header + three shell rows.
      expect(lines).to.have.length(4);
      expect(lines[0]).to.equal('Reading,Status,Recorded By,Notes');

      // Each shell row has every cell empty — they are produced as
      // `,,,` (three separators, no values). The line starts with a
      // comma because the Reading cell is the empty string.
      for (let i = 1; i <= 3; i += 1) {
        expect(lines[i]).to.equal(',,,');
      }
    });
  });

  it('exports a mixed batch where some records lack both reading and value, others have only `value`', () => {
    // Drive both branches in the same export: pickReadingValue returning
    // the `value` fallback (line 38) AND pickReadingValue returning null
    // (line 40). One row has only `value` (no `reading`); the other row
    // has neither. The first row exercises the value-fallback branch,
    // the second exercises the null-fallback branch.
    cy.intercept('GET', '**/future-gadget-lab/divergence-readings', {
      statusCode: 200,
      body: [
        {
          id: 'DR-300',
          // reading intentionally absent — line 38 fires.
          value: 0.409845,
          status: 'alpha',
          recorded_by: 'Kiryu Moeka',
          notes: 'Binary',
        },
        {
          id: 'DR-301',
          // Neither reading nor value — line 40 fires.
          status: 'delta',
          recorded_by: 'Amane Suzuha',
          notes: 'Time traveller',
        },
      ],
    }).as('mixedReadings');

    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="worldline-container"]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="readings-table"]', { timeout: 15000 }).should('be.visible');
    installDownloadSpy();

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1);
      const lines = csv.split('\r\n').filter((line) => line.length > 0);

      // Header + two rows.
      expect(lines).to.have.length(3);
      expect(lines[0]).to.equal('Reading,Status,Recorded By,Notes');

      // Row 1: `value` fallback (line 38). Empty notes → the trailing
      // field is empty too. Notes is non-empty here so no quoting.
      expect(lines[1]).to.equal('0.409845,alpha,Kiryu Moeka,Binary');

      // Row 2: pickReadingValue returned null (line 40) → empty Reading
      // cell → the row starts with a comma. status/recorded_by/notes
      // are present so the optional-chaining + `??` branches do not
      // need to fall back.
      expect(lines[2]).to.equal(',delta,Amane Suzuha,Time traveller');
    });
  });
});
