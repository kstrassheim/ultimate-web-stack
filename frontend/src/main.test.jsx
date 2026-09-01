/**
 * Regression coverage for issue #151 — the MSAL popup redirect bridge.
 *
 * `main.jsx` deliberately renders nothing when it decides the current
 * document is a popup carrying an Entra auth response: it hands the response
 * to the opener via BroadcastChannel and relies on `window.close()`. Two
 * failure modes came out of that in an installed Edge PWA on Windows:
 *
 *  1. The old check matched a bare `code=` / `error=` / `state=` anywhere in
 *     `location.hash + location.search`, with no popup check. A PWA whose
 *     install-time `start_url` captured `?code=…` therefore rendered a
 *     permanently blank app in its MAIN window, on every launch.
 *  2. When `window.close()` is refused — COOP severs `window.opener` after
 *     the cross-origin Entra navigation, and a PWA-spawned window is a
 *     separate browsing context — the user was left with a blank window and
 *     nothing to explain it.
 */

const mockRender = jest.fn();
const mockCreateRoot = jest.fn(() => ({ render: mockRender }));
const mockBroadcastResponseToMainFrame = jest.fn();

jest.mock('react-dom/client', () => ({
  __esModule: true,
  default: { createRoot: (...args) => mockCreateRoot(...args) },
  createRoot: (...args) => mockCreateRoot(...args),
}));

jest.mock('@azure/msal-browser/redirect-bridge', () => ({
  __esModule: true,
  broadcastResponseToMainFrame: (...args) => mockBroadcastResponseToMainFrame(...args),
}), { virtual: true });

jest.mock('@/App', () => ({ __esModule: true, default: () => null }));
jest.mock('bootstrap/dist/css/bootstrap.min.css', () => ({}), { virtual: true });

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

const loadMain = () => {
  let loaded;
  jest.isolateModules(() => {
    jest.doMock('@/auth/msalInstance', () => ({
      __esModule: true,
      default: { mock: 'msal-instance' },
      msalInitialization: Promise.resolve({ mock: 'msal-instance' }),
    }));
    loaded = require('./main');
  });
  return loaded;
};

describe('main.jsx auth redirect frame detection (issue #151)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    window.location.hash = '';
    window.opener = null;
    jest.useRealTimers();
  });

  afterEach(() => {
    window.location.hash = '';
    window.opener = null;
    mockBroadcastResponseToMainFrame.mockReset();
    mockRender.mockReset();
    mockCreateRoot.mockClear();
    jest.dontMock('@/auth/msalInstance');
  });

  it.each([
    ['#state=xyz'],
    ['#code=abc123&state=xyz'],
    ['#error=access_denied&state=xyz'],
  ])('treats %s as a popup auth response and broadcasts instead of rendering', async (hash) => {
    window.location.hash = hash;

    loadMain();
    await flushMicrotasks();

    expect(mockBroadcastResponseToMainFrame).toHaveBeenCalledTimes(1);
    expect(mockRender).not.toHaveBeenCalled();
  });

  it.each([
    ['#code=abc123'],
    ['#error=access_denied'],
  ])('renders the app for %s with no opener and no state marker', async (hash) => {
    // The regression: matching a bare `code=` blanked the whole app for an
    // installed PWA whose start_url captured ?code= at install time. MSAL
    // always round-trips `state`, so its absence means this is not a popup.
    window.location.hash = hash;

    loadMain();
    await flushMicrotasks();

    expect(mockBroadcastResponseToMainFrame).not.toHaveBeenCalled();
    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  it('still broadcasts for a bare #code url when the window has an opener', async () => {
    window.opener = { closed: false };
    window.location.hash = '#code=abc123';

    loadMain();
    await flushMicrotasks();

    expect(mockBroadcastResponseToMainFrame).toHaveBeenCalledTimes(1);
    expect(mockRender).not.toHaveBeenCalled();
  });

  it('renders the app normally for a plain url', async () => {
    loadMain();
    await flushMicrotasks();

    expect(mockBroadcastResponseToMainFrame).not.toHaveBeenCalled();
    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  describe('isAuthRedirectUrl', () => {
    let isAuthRedirectUrl;

    beforeEach(() => {
      ({ isAuthRedirectUrl } = loadMain());
    });

    it.each(['#state=xyz', '?state=xyz', '#code=a&state=xyz'])(
      'matches %s, because MSAL round-trips state on every response',
      (url) => {
        expect(isAuthRedirectUrl(url, null)).toBe(true);
      }
    );

    it.each(['#code=abc', '?code=abc', '#error=denied'])(
      'ignores %s without an opener',
      (url) => {
        expect(isAuthRedirectUrl(url, null)).toBe(false);
      }
    );

    it.each(['#code=abc', '?error=denied'])(
      'matches %s when an opener is present',
      (url) => {
        expect(isAuthRedirectUrl(url, {})).toBe(true);
      }
    );

    it.each([
      '',
      '?stateful=1',
      '#/dashboard',
      '?redirect=/encode=1',
      '?mystate=abc',
    ])('does not match the app url %p', (url) => {
      // Substring matching is anchored on a `#`, `?` or `&` prefix so a query
      // parameter that merely ends in "state"/"code" is not an auth response.
      expect(isAuthRedirectUrl(url, null)).toBe(false);
    });
  });

  describe('popup self-close fallback', () => {
    it('renders a readable notice when the window is still open after the bridge runs', async () => {
      // The reported symptom was a blank Edge window with nothing in it. If
      // close() is refused the user must at least be told what happened.
      const { renderAuthPopupFallback } = loadMain();
      renderAuthPopupFallback();

      const notice = document.querySelector('[data-testid="auth-popup-fallback"]');
      expect(notice).not.toBeNull();
      expect(notice.textContent).toMatch(/close this window/i);
    });

    it('schedules the fallback after the bridge resolves', async () => {
      // The bridge is loaded with a dynamic import(), so the timer is armed
      // several microtask turns after module evaluation. Spying on
      // window.setTimeout is deterministic where tick-counting is not: it
      // captures both the delay and the callback the module actually armed.
      const setTimeoutSpy = jest.spyOn(window, 'setTimeout');
      window.location.hash = '#state=xyz';

      const { AUTH_POPUP_SELF_CLOSE_GRACE_MS, renderAuthPopupFallback } = loadMain();
      await flushMicrotasks();

      expect(mockBroadcastResponseToMainFrame).toHaveBeenCalledTimes(1);
      expect(setTimeoutSpy).toHaveBeenCalledWith(
        renderAuthPopupFallback,
        AUTH_POPUP_SELF_CLOSE_GRACE_MS,
      );
      expect(AUTH_POPUP_SELF_CLOSE_GRACE_MS).toBeGreaterThan(0);

      // Nothing is rendered before the grace period elapses — a window that
      // closes itself promptly must not flash a "you can close this" notice.
      expect(document.querySelector('[data-testid="auth-popup-fallback"]')).toBeNull();

      // Running the armed callback produces the readable notice.
      const armed = setTimeoutSpy.mock.calls.find(
        ([fn, delay]) => fn === renderAuthPopupFallback && delay === AUTH_POPUP_SELF_CLOSE_GRACE_MS,
      );
      armed[0]();
      expect(document.querySelector('[data-testid="auth-popup-fallback"]')).not.toBeNull();

      setTimeoutSpy.mockRestore();
    });

    it('still shows the notice when the bridge itself throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBroadcastResponseToMainFrame.mockImplementation(() => {
        throw new Error('bridge exploded');
      });
      window.location.hash = '#state=xyz';

      const { renderAuthPopupFallback } = loadMain();
      await flushMicrotasks();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'MSAL redirect bridge failed',
        expect.any(Error),
      );
      renderAuthPopupFallback();
      expect(document.querySelector('[data-testid="auth-popup-fallback"]')).not.toBeNull();
      consoleErrorSpy.mockRestore();
    });
  });
});
