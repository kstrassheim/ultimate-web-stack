import {
  saveRedirectPath,
  consumeRedirectPath,
  reauthenticate,
  isReauthInFlight,
  _resetReauthStateForTests,
  REDIRECT_PATH_STORAGE_KEY,
} from './authFlow';

const silentConsoleError = () => {
  const original = console.error;
  console.error = jest.fn();
  return () => { console.error = original; };
};

describe('authFlow', () => {
  const _sessionStorageBackup = {};

  beforeEach(() => {
    _resetReauthStateForTests();
    // Clean any leftover sessionStorage from previous tests
    try { window.sessionStorage.clear(); } catch (_) { /* noop */ }
    if (typeof window !== 'undefined') {
      window.__uwsRecoveryInFlight = false;
    }
  });

  afterEach(() => {
    _resetReauthStateForTests();
    try { window.sessionStorage.clear(); } catch (_) { /* noop */ }
    // tear down any leftover window globals
    delete window.__uwsRecoveryInFlight;
  });

  describe('saveRedirectPath / consumeRedirectPath', () => {
    it('round-trips a path through sessionStorage', () => {
      saveRedirectPath('/dashboard?tab=worldline');
      expect(window.sessionStorage.getItem(REDIRECT_PATH_STORAGE_KEY)).toBe('/dashboard?tab=worldline');
      const next = consumeRedirectPath();
      expect(next).toBe('/dashboard?tab=worldline');
      expect(window.sessionStorage.getItem(REDIRECT_PATH_STORAGE_KEY)).toBeNull();
    });

    it('falls back to window.location when no path is given', () => {
      // Pretend the user is on /experiments
      window.history.pushState({}, '', '/experiments');
      saveRedirectPath();
      expect(window.sessionStorage.getItem(REDIRECT_PATH_STORAGE_KEY)).toBe('/experiments');
      const next = consumeRedirectPath();
      expect(next).toBe('/experiments');
    });

    it('consumeRedirectPath defaults to "/" when nothing is stored', () => {
      expect(consumeRedirectPath()).toBe('/');
    });

    it('consumeRedirectPath falls back to "/" on bad stored values', () => {
      window.sessionStorage.setItem(REDIRECT_PATH_STORAGE_KEY, 'null');
      expect(consumeRedirectPath()).toBe('/');
      window.sessionStorage.setItem(REDIRECT_PATH_STORAGE_KEY, 'undefined');
      expect(consumeRedirectPath()).toBe('/');
      window.sessionStorage.setItem(REDIRECT_PATH_STORAGE_KEY, '');
      expect(consumeRedirectPath()).toBe('/');
    });

    it('does not throw when sessionStorage is absent', () => {
      const original = window.sessionStorage;
      // Pretend we're in a non-browser environment
       
      delete window.sessionStorage;
      try {
        expect(() => saveRedirectPath('/x')).not.toThrow();
        expect(consumeRedirectPath()).toBe('/');
      } finally {
        window.sessionStorage = original;
      }
    });
  });

  describe('reauthenticate', () => {
    let restoreConsole;
    beforeEach(() => {
      restoreConsole = silentConsoleError();
    });
    afterEach(() => {
      restoreConsole();
    });

    it('calls loginPopup, sets active account, navigates to saved path', async () => {
      const navigate = jest.fn();
      const instance = {
        loginPopup: jest.fn().mockResolvedValue({ account: { name: 'Test' } }),
        setActiveAccount: jest.fn(),
      };
      saveRedirectPath('/dashboard');

      const result = await reauthenticate(instance, { navigate });

      expect(result.success).toBe(true);
      expect(instance.loginPopup).toHaveBeenCalledTimes(1);
      expect(instance.setActiveAccount).toHaveBeenCalledWith({ name: 'Test' });
      expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
      expect(isReauthInFlight()).toBe(false);
    });

    it('saves the target when one is provided', async () => {
      const navigate = jest.fn();
      const instance = {
        loginPopup: jest.fn().mockResolvedValue({ account: { name: 'A' } }),
        setActiveAccount: jest.fn(),
      };

      await reauthenticate(instance, { navigate, target: '/experiments' });

      expect(navigate).toHaveBeenCalledWith('/experiments', { replace: true });
    });

    it('falls back to window.history when navigate is missing', async () => {
      const instance = {
        loginPopup: jest.fn().mockResolvedValue({ account: { name: 'A' } }),
        setActiveAccount: jest.fn(),
      };
      saveRedirectPath('/foo');
      // window.history.replaceState is implemented by JSDOM.
      const spy = jest.spyOn(window.history, 'replaceState');
      await reauthenticate(instance);
      // JSDOM doesn't fire `popstate` from replaceState, but the call
      // was made.
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('returns success: false on login failure without throwing', async () => {
      const instance = {
        loginPopup: jest.fn().mockRejectedValue(new Error('user closed popup')),
        setActiveAccount: jest.fn(),
      };

      const result = await reauthenticate(instance, { navigate: jest.fn() });

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('user closed popup');
      expect(isReauthInFlight()).toBe(false);
    });

    it('clears the saved redirect path even on failure', async () => {
      const instance = {
        loginPopup: jest.fn().mockRejectedValue(new Error('boom')),
        setActiveAccount: jest.fn(),
      };
      saveRedirectPath('/do-not-return-here');
      await reauthenticate(instance, { navigate: jest.fn() });
      expect(window.sessionStorage.getItem(REDIRECT_PATH_STORAGE_KEY)).toBeNull();
    });

    it('is single-flight: concurrent calls share the same promise', async () => {
      let resolveLogin;
      const instance = {
        loginPopup: jest.fn().mockImplementation(() => new Promise((resolve) => {
          resolveLogin = resolve;
        })),
        setActiveAccount: jest.fn(),
      };
      const navigate = jest.fn();

      const first = reauthenticate(instance, { navigate, target: '/x' });
      const second = reauthenticate(instance, { navigate, target: '/x' });
      expect(instance.loginPopup).toHaveBeenCalledTimes(1);
      resolveLogin({ account: { name: 'A' } });
      const [r1, r2] = await Promise.all([first, second]);
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('uses forceSelectAccount when requested', async () => {
      const instance = {
        loginPopup: jest.fn().mockResolvedValue({ account: { name: 'A' } }),
        setActiveAccount: jest.fn(),
      };
      await reauthenticate(instance, { navigate: jest.fn(), forceSelectAccount: true });
      const arg = instance.loginPopup.mock.calls[0][0];
      expect(arg.prompt).toBe('select_account');
    });

    it('runs onBeforePopup before loginPopup', async () => {
      const instance = {
        loginPopup: jest.fn().mockResolvedValue({ account: { name: 'A' } }),
        setActiveAccount: jest.fn(),
      };
      const calls = [];
      await reauthenticate(instance, {
        navigate: jest.fn(),
        onBeforePopup: () => calls.push('before'),
      });
      expect(calls).toEqual(['before']);
      expect(instance.loginPopup).toHaveBeenCalledTimes(1);
    });

    it('keeps going even if onBeforePopup throws', async () => {
      const instance = {
        loginPopup: jest.fn().mockResolvedValue({ account: { name: 'A' } }),
        setActiveAccount: jest.fn(),
      };
      const result = await reauthenticate(instance, {
        navigate: jest.fn(),
        onBeforePopup: () => { throw new Error('before failed'); },
      });
      expect(result.success).toBe(true);
      expect(instance.loginPopup).toHaveBeenCalledTimes(1);
    });

    it('dispatches uws:recovery:started and :finished events on the window', async () => {
      const instance = {
        loginPopup: jest.fn().mockResolvedValue({ account: { name: 'A' } }),
        setActiveAccount: jest.fn(),
      };
      const started = jest.fn();
      const finished = jest.fn();
      window.addEventListener('uws:recovery:started', started);
      window.addEventListener('uws:recovery:finished', finished);
      try {
        await reauthenticate(instance, { navigate: jest.fn() });
        // flush microtasks so both listeners fired before assertions
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(started).toHaveBeenCalled();
        expect(finished).toHaveBeenCalled();
      } finally {
        window.removeEventListener('uws:recovery:started', started);
        window.removeEventListener('uws:recovery:finished', finished);
      }
    });
  });
});