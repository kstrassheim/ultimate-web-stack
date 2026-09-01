/**
 * End-to-end coverage for issue #151 — missing Microsoft Graph consent must
 * degrade to a "Grant access" button instead of throwing a popup window.
 *
 * Reported symptom: installed as a PWA in Edge on Windows, in-app navigation
 * threw focus into a new, empty Edge browser window. `retrieveTokenForGraph`
 * asked for `https://graph.microsoft.com/.default` — every delegated
 * permission already consented for this user — so a user missing consent hit
 * `InteractionRequiredAuthError` on every call, and the catch fell straight
 * through to `acquireTokenPopup`. That is `window.open`, called from the
 * Dashboard's mount effect: once per navigation that mounts the dashboard,
 * and in an installed PWA each one is a separate top-level browser window.
 *
 * The mock build routes `getAllGroups` through the real
 * `retrieveTokenForGraph` (see `mock/graphApi.js`), so these specs exercise
 * the production gating rather than stepping around it. The mock MSAL rejects
 * Graph-scoped silent acquisition while `MOCK_GRAPH_CONSENT_REQUIRED` is set
 * (see `mock/azureMsalBrowser.js`) — a Graph-specific affordance, kept apart
 * from the session-expiry flags because missing consent is not session expiry.
 */

const requireGraphConsent = () => {
  cy.window().then((win) => {
    win.localStorage.setItem('MOCK_GRAPH_CONSENT_REQUIRED', 'true');
  });
};

const grantGraphConsent = () => {
  cy.window().then((win) => {
    win.localStorage.removeItem('MOCK_GRAPH_CONSENT_REQUIRED');
  });
};

const gotoDashboard = () => {
  cy.get('[data-testid="nav-dashboard"]').click();
  cy.get('[data-testid="dashboard-page"]', { timeout: 10000 }).should('be.visible');
  cy.get('[data-testid="loading-overlay"]').should('not.exist', { timeout: 15000 });
};

describe('Graph consent handling (issue #151)', () => {
  beforeEach(() => {
    cy.setMockRole('User');
    cy.visit('/');
    cy.get('[data-testid="sign-in-button"]').click();
  });

  afterEach(() => {
    cy.window().then((win) => {
      win.localStorage.removeItem('MOCK_GRAPH_CONSENT_REQUIRED');
      win.localStorage.removeItem('MOCK_GRAPH_POPUP_FAIL');
    });
  });

  it('never opens a popup window when Graph consent is missing', () => {
    // The heart of the report. `acquireTokenPopup` is `window.open`; if the
    // mount-time fetch is still allowed to prompt, this spy catches it.
    requireGraphConsent();

    cy.window().then((win) => {
      cy.spy(win, 'open').as('windowOpen');
    });

    gotoDashboard();

    cy.get('[data-testid="groups-consent-required"]').should('be.visible');
    cy.get('@windowOpen').should('not.have.been.called');
  });

  it('degrades to a Grant access button while the rest of the dashboard loads', () => {
    // Before the fix the groups fetch sat in the same Promise.all as the
    // app's own API call, so a consent failure took the whole page with it.
    requireGraphConsent();
    gotoDashboard();

    cy.get('[data-testid="groups-consent-required"]').should('be.visible');
    cy.contains('Grant access').should('be.visible');

    // The rest of the page is unaffected.
    cy.get('[data-testid="api-response-card"]').should('be.visible');
    cy.get('[data-testid="worldline-container"]').should('be.visible');
    cy.get('[data-testid="error-message"]').should('not.exist');
  });

  it('loads the groups once the user grants access from the button', () => {
    requireGraphConsent();
    gotoDashboard();
    cy.get('[data-testid="grant-groups-access-button"]').should('be.visible');

    // The click is a real user gesture, so this call may prompt. The mock's
    // acquireTokenPopup resolves, which is what an accepted consent looks
    // like — and a successful grant clears the memoised block.
    grantGraphConsent();
    cy.get('[data-testid="grant-groups-access-button"]').click();

    cy.get('[data-testid="groups-consent-required"]').should('not.exist');
    cy.get('[data-testid="groups-container"]').should('be.visible');
  });

  it('surfaces an error when the user dismisses the consent popup', () => {
    // The interactive path is allowed to fail; it must report rather than
    // silently leave the button spinning.
    requireGraphConsent();
    gotoDashboard();
    cy.get('[data-testid="grant-groups-access-button"]').should('be.visible');

    cy.window().then((win) => {
      win.localStorage.setItem('MOCK_GRAPH_POPUP_FAIL', 'true');
    });
    cy.get('[data-testid="grant-groups-access-button"]').click();

    cy.get('[data-testid="error-message"]', { timeout: 10000 }).should('be.visible');
  });

  it('does not re-prompt on repeated navigations to the dashboard', () => {
    // The memoisation: one interaction-required outcome must not become one
    // popup per navigation. Bounce off the dashboard and back several times.
    requireGraphConsent();

    cy.window().then((win) => {
      cy.spy(win, 'open').as('windowOpen');
    });

    gotoDashboard();
    cy.get('[data-testid="groups-consent-required"]').should('be.visible');

    for (let i = 0; i < 3; i += 1) {
      cy.get('[data-testid="nav-home"]').click();
      gotoDashboard();
      cy.get('[data-testid="groups-consent-required"]').should('be.visible');
    }

    cy.get('@windowOpen').should('not.have.been.called');
  });

  it('loads groups normally when consent is present', () => {
    // Positive control: the default path must be untouched by all of the above.
    gotoDashboard();

    cy.get('[data-testid="groups-consent-required"]').should('not.exist');
    cy.get('[data-testid="groups-container"]').should('be.visible');
  });
});
