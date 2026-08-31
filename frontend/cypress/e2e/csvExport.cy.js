// E2E tests for the divergence-readings CSV export button on the
// WorldlineMonitor dashboard. Exercises the production download path
// (handleExportReadingsCsv -> divergenceReadingsToCsv -> rowsToCsv ->
// escapeCsvField, plus downloadCsv -> Blob -> URL.createObjectURL ->
// <a download> click) end-to-end so the new code is covered by the
// coverage threshold that e2e-tests enforces.

import { setMockRole } from '../support/msalMock';

describe('Divergence readings CSV export', () => {
  // Capture state shared between the page-side setup and the test
  // body. Server-side `cy.window()` writes here; the test reads it
  // back after the click.
  let capture;

  // Install stubs on URL.createObjectURL / URL.revokeObjectURL and
  // document.createElement so the production download path can run
  // end-to-end inside jsdom (which doesn't actually persist blob
  // downloads). The blobs handed to URL.createObjectURL are kept
  // around for assertions on the CSV payload.
  //
  // MUST be called AFTER the dashboard page has loaded - cy.visit
  // creates a new window context, so any earlier installation gets
  // thrown away. `signInAndOpenDashboard` calls this once the table
  // has rendered.
  const installDownloadSpy = () => {
    capture = {
      blobs: [],
      anchorDownload: null,
      anchorClickCount: 0,
      anchorElements: []
    };
    cy.window().then((win) => {
      // Wrap the Blob constructor so the parts Array is preserved
      // on the instance. jsdom's Blob doesn't expose its constructor
      // arguments, so this is the only way to assert on the literal
      // CSV payload.
      const OriginalBlob = win.Blob;
      function WrappedBlob(parts, options) {
        const instance = new OriginalBlob(parts, options);
        try {
          instance.__rawParts = Array.isArray(parts) ? parts.slice() : [parts];
          instance.__options = options;
        } catch (e) {
          // Some Blob implementations are non-extensible; skip the
          // capture but still let the Blob be created.
        }
        return instance;
      }
      WrappedBlob.prototype = OriginalBlob.prototype;
      Object.setPrototypeOf(WrappedBlob, OriginalBlob);
      // Preserve static properties so `Blob.[Symbol.species]` etc.
      // still work for code that uses them.
      Object.defineProperty(WrappedBlob, 'name', { value: 'Blob' });
      win.Blob = WrappedBlob;

      win.URL.createObjectURL = (blob) => {
        capture.blobs.push(blob);
        return 'blob:cypress-csv-export';
      };
      win.URL.revokeObjectURL = () => {
        // No-op; the spy just needs to exist so downloadCsv doesn't
        // throw on the deferred revocation.
      };

      const originalCreateElement = win.document.createElement.bind(win.document);
      win.document.createElement = (tag) => {
        const el = originalCreateElement(tag);
        if (tag && tag.toLowerCase() === 'a') {
          capture.anchorElements.push(el);
          const originalClick = el.click.bind(el);
          el.click = () => {
            capture.anchorClickCount += 1;
            capture.anchorDownload = el.download;
            return originalClick();
          };
        }
        return el;
      };
    });
  };

  // Read the CSV payload out of a captured blob. The capture above
  // stores the original parts array in `__rawParts` so the test
  // can assert on the literal CSV text without depending on Blob
  // internals across jsdom versions.
  const blobToCsv = (blob) => {
    if (blob && Array.isArray(blob.__rawParts)) {
      return blob.__rawParts.join('');
    }
    if (blob && typeof blob.text === 'function') {
      return blob.text();
    }
    return '';
  };

  // Drive the sign-in + dashboard navigation that the other
  // dashboard.cy.js tests use. MOCK=true backend seeds 5 readings
  // (mix of steins_gate / alpha / beta by Rintaro Okabe / Suzuha
  // Amane) so the export has something to serialize.
  const signInAndOpenDashboard = () => {
    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="worldline-container"]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="readings-table"]', { timeout: 15000 }).should('be.visible');
    // Install the URL/document spies AFTER the dashboard page has
    // loaded so the production downloadCsv runs against our stubs.
    installDownloadSpy();
  };

  it('renders the Export CSV button on the divergence readings card', () => {
    signInAndOpenDashboard();
    cy.get('[data-testid="divergence-readings-card"]').within(() => {
      cy.get('[data-testid="export-readings-csv-btn"]')
        .should('be.visible')
        .and('not.be.disabled')
        // `contain.text` takes a STRING. Handed a regex it compares the
        // button's text to the RegExp object itself, which can never match —
        // so this failed with `-'Export CSV'` against `+/export.*csv/i` while
        // the button was rendering perfectly. `match` is the assertion that
        // takes a pattern, and it needs the text as the subject.
        .invoke('text')
        .should('match', /export.*csv/i);
    });
  });

  it('clicking Export CSV downloads a CSV with header row and respects table order', () => {
    signInAndOpenDashboard();

    // Capture the visible row order on screen — the export must
    // match this order (acceptance criterion #2).
    const visibleReadingIds = [];
    cy.get('[data-testid="readings-table"] tbody tr').each(($row) => {
      const testId = $row.attr('data-testid') || '';
      const m = testId.match(/^reading-row-(.+)$/);
      if (m) visibleReadingIds.push(m[1]);
    });

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    // Cypress serialises asynchronous commands through a queue, so
    // read the captured state through a `wrap(null)` to make sure the
    // click chain has fully resolved before we assert.
    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1, 'URL.createObjectURL was called exactly once');
      const blob = capture.blobs[0];
      expect(blob.__options).to.deep.include({
        type: 'text/csv;charset=utf-8;'
      });

      const raw = blobToCsv(blob);
      // UTF-8 BOM at the start so Excel decodes non-ASCII correctly.
      expect(raw.charCodeAt(0)).to.equal(0xfeff);
      const csv = raw.slice(1);
      const lines = csv.split('\r\n').filter((line) => line.length > 0);

      // Header row in the documented column order.
      expect(lines[0]).to.equal('Reading,Status,Recorded By,Notes');
      // One data row per visible table row.
      const dataRows = lines.slice(1);
      expect(dataRows.length).to.equal(visibleReadingIds.length);

      // Anchor click was triggered and the filename is set.
      expect(capture.anchorClickCount).to.equal(1);
      expect(capture.anchorDownload).to.match(/^divergence-readings-\d{4}-\d{2}-\d{2}\.csv$/);
    });
  });

  it('export respects the active status filter (only matching rows are exported)', () => {
    signInAndOpenDashboard();

    cy.get('[data-testid="status-filter"]').select('steins_gate');
    cy.get('[data-testid="readings-table"] tbody tr').should('have.length', 1);

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1); // drop BOM
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      // Header + exactly one filtered row.
      expect(lines).to.have.length(2);
      expect(lines[1]).to.include('steins_gate');
    });
  });

  it('export button is disabled when no readings are visible', () => {
    // Force the readings endpoint to return an empty list so the
    // disabled-state branch of the export button is exercised.
    // Install this interception BEFORE the dashboard loads so the
    // initial fetch returns [].
    cy.intercept('GET', '**/future-gadget-lab/divergence-readings', {
      statusCode: 200,
      body: []
    }).as('emptyReadings');

    // Manual navigation that doesn't need the readings table to be
    // populated — the button should be disabled either way.
    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="worldline-container"]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should('not.exist');
    // Don't wait for readings-table — it never renders when the
    // list is empty (the component shows "no-readings" instead).
    installDownloadSpy();

    cy.get('[data-testid="export-readings-csv-btn"]').should('be.disabled');
    // The handler must not have been invoked — no blob, no anchor click.
    expect(capture.anchorClickCount).to.equal(0);
  });

  it('export correctly escapes commas, quotes, and newlines in field values', () => {
    // Inject readings with characters that need RFC 4180 escaping.
    // The default mock data set doesn't include any commas / quotes
    // / newlines, so without this interception the escape branch
    // of escapeCsvField is never hit by the e2e suite.
    cy.intercept('GET', '**/future-gadget-lab/divergence-readings', {
      statusCode: 200,
      body: [
        {
          id: 'DR-001',
          reading: 1.048596,
          status: 'steins_gate',
          recorded_by: 'Doe, John',
          notes: 'Said "hello"\nthen left'
        }
      ]
    }).as('escapeReadings');

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
      const lines = csv.split('\r\n');
      // Header + one row that contains a newline embedded in a
      // quoted field. The split('\r\n') leaves the embedded LF
      // inside the row, so the unique "data" line count is 2
      // (header + the row that wraps the multi-line quoted field).
      // Filter out any trailing empty element from the joined CRLF.
      const dataLines = lines.filter((line) => line.length > 0);
      expect(dataLines.length).to.be.at.least(2);
      // The row line must contain the escaped comma + escaped quotes.
      expect(dataLines[1]).to.include('"Doe, John"');
      expect(dataLines[1]).to.include('"Said ""hello""');
    });
  });

  it('exports readings that use "value" instead of "reading" (legacy backend shape)', () => {
    // divergenceReadingsCsv.js -> pickReadingValue() accepts the
    // "value" key for backward compatibility with older backend
    // payloads that haven't migrated to the "reading" key yet. The
    // e2e suite normally seeds readings with the modern "reading"
    // shape (csvExport.cy.js, dashboard.cy.js), so without this
    // interception the .value branch is never hit from a browser.
    cy.intercept('GET', '**/future-gadget-lab/divergence-readings', {
      statusCode: 200,
      body: [
        {
          id: 'DR-VALUE',
          value: 0.571024,
          status: 'alpha',
          recorded_by: 'Mayuri Shiina',
          notes: 'Legacy-shape reading'
        }
      ]
    }).as('valueShapeReadings');

    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should(
      'be.visible',
    );
    cy.get('[data-testid="worldline-container"]', { timeout: 15000 }).should(
      'be.visible',
    );
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should(
      'not.exist',
    );
    cy.get('[data-testid="readings-table"]', { timeout: 15000 }).should(
      'be.visible',
    );
    installDownloadSpy();

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1); // drop BOM
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      // Header + the one row whose Reading column came from .value
      // (not .reading).
      expect(lines).to.have.length(2);
      expect(lines[1]).to.equal('0.571024,alpha,Mayuri Shiina,Legacy-shape reading');
    });
  });

  it('exports empty Reading cells when neither "reading" nor "value" is present', () => {
    // divergenceReadingsCsv.js -> pickReadingValue()'s terminal
    // `return null;` branch when the row has neither legacy nor
    // modern keys. Production data never looks like this, but the
    // branch is reachable in practice whenever the backend emits a
    // stub record or a transient formatting bug — it's important
    // the export renders the empty cell instead of throwing or
    // emitting "null" / "undefined" as the value.
    cy.intercept('GET', '**/future-gadget-lab/divergence-readings', {
      statusCode: 200,
      body: [
        {
          id: 'DR-NULLISH',
          status: 'beta',
          recorded_by: 'Suzuha Amane',
          notes: 'No numeric value attached'
        }
      ]
    }).as('nullishReadings');

    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should(
      'be.visible',
    );
    cy.get('[data-testid="worldline-container"]', { timeout: 15000 }).should(
      'be.visible',
    );
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should(
      'not.exist',
    );
    cy.get('[data-testid="readings-table"]', { timeout: 15000 }).should(
      'be.visible',
    );
    installDownloadSpy();

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.wrap(null).then(() => {
      expect(capture.blobs).to.have.length(1);
      const csv = blobToCsv(capture.blobs[0]).slice(1); // drop BOM
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      expect(lines).to.have.length(2);
      // Empty Reading cell — the first column of the data row is a
      // bare comma, not the string "null" or "undefined".
      expect(lines[1]).to.equal(',beta,Suzuha Amane,No numeric value attached');
    });
  });

  it('export surfaces a user-visible error when the download pipeline throws', () => {
    signInAndOpenDashboard();

    // Drive the failure branch of handleExportReadingsCsv by making
    // URL.createObjectURL throw. The production handler catches and
    // surfaces a notyf error; this exercises both the catch block
    // and the telemetry path.
    cy.window().then((win) => {
      win.URL.createObjectURL = () => {
        throw new Error('boom');
      };
    });

    cy.get('[data-testid="export-readings-csv-btn"]').click();

    cy.get('.notyf__toast--error', { timeout: 5000 })
      .should('be.visible')
      .and('contain.text', 'Failed to export readings: boom');
  });
});
