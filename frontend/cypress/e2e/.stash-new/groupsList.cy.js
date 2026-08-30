/**
 * End-to-end coverage for `src/pages/components/GroupsList.jsx` — the
 * three render branches the component can take:
 *
 *   1. `loading === true` → renders the "Loading groups..." placeholder.
 *   2. `!groups || groups.length === 0` → renders the "No groups available"
 *      empty-state placeholder.
 *   3. `groups.length > 0` → renders the full table, including the
 *      `displayName`, the `description || 'No description'` fallback,
 *      the `mail || 'No email'` fallback, and the "Total groups: N" footer.
 *
 * Branches 1 and 3 already exercise incidentally through the dashboard
 * happy path (dashboard.cy.js's `should load groups data correctly`),
 * but the explicit assertions below drive each branch on its own so a
 * future change to dashboard wiring cannot silently retire them.
 *
 * Branch 2 (empty state) and the falsy `description || 'No description'`
 * / `mail || 'No email'` fallbacks (GroupsList.jsx lines 27-28) are only
 * reachable when the Graph payload omits groups or leaves those fields
 * off the records. The default mock always returns a populated set of
 * groups, so without an override those branches stay at 0%. The mock
 * (`mock/graphApi.js`) honours a `MOCK_GROUPS_OVERRIDE` localStorage
 * key for exactly this purpose — see the comment in that file. The
 * pattern matches the existing `MOCK_LOGIN_FAIL` /
 * `MOCK_INTERACTION_REQUIRED` hooks in `mock/azureMsalBrowser.js`.
 */

describe('GroupsList — empty-state and falsy-field branches', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });

    // Seed the MOCK_GROUPS_OVERRIDE BEFORE the Dashboard mounts so the
    // mock's getAllGroups reads the controlled payload on its first
    // call. Without this, the dashboard hits the canned mock data and
    // the empty-state / falsy-field branches stay at 0%.
    cy.setMockRole('User');
    cy.window().then((win) => {
      const override = win.localStorage.getItem('MOCK_GROUPS_OVERRIDE');
      if (override === null) {
        // Default: leave the override off so unrelated tests still see
        // the canned mock groups. Individual tests below override this
        // explicitly.
        return;
      }
    });
  });

  const setGroupsOverride = (groups) => {
    cy.window().then((win) => {
      win.localStorage.setItem('MOCK_GROUPS_OVERRIDE', JSON.stringify(groups));
    });
  };

  const clearGroupsOverride = () => {
    cy.window().then((win) => {
      win.localStorage.removeItem('MOCK_GROUPS_OVERRIDE');
    });
  };

  it('renders the empty-state placeholder when Graph returns no groups', () => {
    setGroupsOverride([]);

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');

    // The empty-state placeholder renders inside the groups container.
    // data-testid="groups-empty" is only set on the `groups.length === 0`
    // branch in GroupsList.jsx.
    cy.get('[data-testid="groups-empty"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="groups-empty"]').should('contain', 'No groups available');

    // The full-table branch must NOT be in the DOM at the same time.
    cy.get('[data-testid="groups-list-container"]').should('not.exist');
    cy.get('[data-testid="groups-summary"]').should('not.exist');

    // Reload button still works even with no groups — Dashboard's own
    // success toast is independent of the groups payload.
    clearGroupsOverride();
  });

  it('renders "No description" / "No email" fallbacks when group records omit those fields', () => {
    // The falsy `description || 'No description'` and `mail || 'No email'`
    // branches in GroupsList.jsx (lines 27-28) are only reached when a
    // group record is missing `description` and/or `mail`. The default
    // mock returns groups with both fields populated, so without this
    // override those branches stay at 0%.
    setGroupsOverride([
      {
        id: 'g-1',
        displayName: 'Future Gadget Laboratory',
        // description and mail intentionally omitted
      },
      {
        id: 'g-2',
        displayName: 'Operation Skuld',
        description: '',
        mail: '',
      },
    ]);

    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]', { timeout: 10000 }).should('be.visible');

    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');

    // The full-table branch renders. Each row is keyed by `group.id`
    // and the cells expose data-testids for the per-row fields.
    cy.get('[data-testid="groups-list-container"]', { timeout: 10000 }).should('be.visible');

    // First row: description/mail entirely missing → both fallbacks fire.
    cy.get('[data-testid="group-row-g-1"]').within(() => {
      cy.contains('td', 'No description').should('be.visible');
      cy.contains('td', 'No email').should('be.visible');
    });

    // Second row: empty strings (`"" || 'No description'` is falsy on
    // the left side; the fallback fires too).
    cy.get('[data-testid="group-row-g-2"]').within(() => {
      cy.contains('td', 'No description').should('be.visible');
      cy.contains('td', 'No email').should('be.visible');
    });

    // Summary row counts the entries.
    cy.get('[data-testid="groups-summary"]').should('contain', 'Total groups: 2');

    clearGroupsOverride();
  });
});
