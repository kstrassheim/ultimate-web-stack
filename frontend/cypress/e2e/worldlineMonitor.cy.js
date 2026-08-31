/**
 * End-to-end coverage for WorldlineMonitor — issue #149.
 *
 * dashboard.cy.js already covers the dashboard's user-visible layout
 * (cards in the right order, refresh buttons, the WebSocket "Connected"
 * badge) and csvExport.cy.js drives the divergence-readings export.
 * What is left to exercise from a real browser is the WebSocket
 * message handler inside WorldlineMonitor:
 *
 *   - `if (message.rawData)` — the JSON-parsed branch of the socket
 *     wrapper (vs. the raw text branch);
 *   - `if (worldlineData.current_worldline)` — the status-update
 *     trigger;
 *   - `if (worldlineData.includes_preview)` — the preview-notification
 *     branch (vs. the generic "Worldline status updated" toast);
 *   - `fetchWorldlineHistory().then(... fetchDivergenceReadings())`
 *     — the follow-on refresh when the first readings list is empty.
 *
 * The handler runs every time the backend pushes a JSON message on
 * the worldline-status WebSocket. With the mock backend there is no
 * real producer for those messages, so the only way to drive the
 * handler from a Cypress test is to capture the WebSocket the page
 * opens and dispatch a synthetic onmessage event with a payload
 * shaped like the real backend's. We do exactly that, using the
 * same `WebSocket.prototype.send` interception pattern that
 * experiments.cy.js uses for its lab-socket tests.
 *
 * Driving the message through the real `WebSocketClient.onmessage`
 * (not by calling the React callback directly) keeps the coverage
 * honest: the JSON-parse / wrapper layers in `src/api/socket.js`
 * are exercised too, so any future drift in that bridge shows up
 * here.
 */

describe('WorldlineMonitor — WebSocket message handling (issue #149)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      console.error('Uncaught exception:', err);
      return false;
    });

    // Install the WebSocket.send interceptor BEFORE the dashboard
    // mounts so we capture the live socket the moment it sends its
    // auth handshake. Save the original once and reuse for the
    // dispatch helpers below.
    cy.visit('/', {
      onBeforeLoad(win) {
        // Reset the helper between page loads so stale handles from a
        // previous spec don't leak through.
        win.__worldlineSocket = undefined;
        win.__worldlineSocketInstalled = false;
      },
    });

    cy.window().then((win) => {
      if (win.__worldlineSocketInstalled) return;
      win.__worldlineSocketInstalled = true;
      const origSend = win.WebSocket.prototype.send;
      win.WebSocket.prototype.send = function patchedSend(data) {
        // Capture every WebSocket the app opens. We key on the URL
        // so we don't dispatch on the wrong socket (the chat page
        // also opens one).
        if (
          typeof data === 'string' &&
          data.includes('"type":"authenticate"') &&
          (this.url || '').includes('worldline-status')
        ) {
          win.__worldlineSocket = this;
        }
        return origSend.call(this, data);
      };
    });
  });

  function dispatch(payload) {
    // Wait for the Worldline WebSocket to be captured. We retry
    // until it exists rather than asserting immediately — the
    // dashboard mounts the WebSocket in a useEffect after the
    // initial fetch settles, so there's a real race between the
    // page becoming visible and the auth handshake firing.
    cy.window()
      .its('__worldlineSocket', { timeout: 15000 })
      .should('exist')
      .then((sock) => {
        const win = sock.ownerDocument.defaultView;
        const event = new win.MessageEvent('message', {
          data: JSON.stringify(payload),
        });
        sock.onmessage(event);
      });
  }

  it('shows the generic "Worldline status updated" toast when a message without includes_preview arrives', () => {
    // Drive the WebSocket handler in its non-preview branch — the
    // message carries current_worldline but NOT includes_preview.
    // This exercises:
    //   - WorldlineMonitor line 217 (message.rawData)
    //   - line 220 (if (worldlineData.current_worldline))
    //   - line 226 (the .then() on fetchWorldlineHistory)
    //   - line 228 (the notyfService.info("Worldline status updated") branch)
    cy.setMockRole('User');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]').should('be.visible');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="worldline-container"]', { timeout: 15000 }).should(
      'be.visible',
    );
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should(
      'not.exist',
    );

    // Wait until the dashboard's init fetch has settled so the
    // follow-on fetchWorldlineHistory from the WebSocket handler
    // isn't racing with the initial mount fetch.
    cy.get('[data-testid="worldline-status-card"]').should('be.visible');
    cy.get('[data-testid="refresh-status-btn"]').should('be.visible');

    dispatch({
      current_worldline: { name: 'Worldline 1.048596' },
      divergence: 1.048596,
    });

    // The generic "Worldline status updated" info toast must surface
    // — that's the user-visible signal that the handler ran the
    // non-preview branch end-to-end.
    cy.get('.notyf__toast--info', { timeout: 10000 })
      .should('be.visible')
      .and('contain.text', 'Worldline status updated');
  });

  it('shows the preview toast with the experiment name when includes_preview is true', () => {
    // Drive the includes_preview=true branch (line 223) — this is the
    // half of the conditional that is NOT covered by the generic
    // status-update spec above. The preview_experiment.name string
    // must be present in the toast so users can tell which experiment
    // they're previewing.
    cy.setMockRole('User');
    cy.get('[data-testid="sign-in-button"]').click();
    cy.get('[data-testid="authenticated-container"]').should('be.visible');
    cy.get('[data-testid="nav-dashboard"]').click();
    cy.get('[data-testid="worldline-container"]', { timeout: 15000 }).should(
      'be.visible',
    );
    cy.get('[data-testid="loading-overlay"]', { timeout: 10000 }).should(
      'not.exist',
    );
    cy.get('[data-testid="worldline-status-card"]').should('be.visible');

    dispatch({
      current_worldline: { name: 'Worldline 0.337192' },
      includes_preview: true,
      preview_experiment: { name: 'Phone Microwave (name)' },
    });

    cy.get('.notyf__toast--info', { timeout: 10000 })
      .should('be.visible')
      .and('contain.text', 'Previewing worldline change from: Phone Microwave (name)');
  });
});