/**
 * @jest-environment node
 *
 * The non-browser halves of authFlow's `typeof window === 'undefined'`
 * guards. jsdom (the suite-wide environment) always defines `window` — it is
 * a non-configurable getter on the global — so these paths can only execute
 * under the plain node environment.
 */

import {
  saveRedirectPath,
  consumeRedirectPath,
  reauthenticate,
  isReauthInFlight,
  _resetReauthStateForTests,
} from './authFlow';

describe('authFlow without a browser window', () => {
  beforeEach(() => {
    _resetReauthStateForTests();
  });

  afterEach(() => {
    _resetReauthStateForTests();
  });

  it('saveRedirectPath is a no-op', () => {
    expect(typeof window).toBe('undefined');
    expect(() => saveRedirectPath('/dashboard')).not.toThrow();
  });

  it('consumeRedirectPath defaults to "/"', () => {
    expect(consumeRedirectPath()).toBe('/');
  });

  it('reauthenticate completes the login without dispatching window events or touching history', async () => {
    const instance = {
      loginPopup: jest.fn().mockResolvedValue({ account: { name: 'A' } }),
      setActiveAccount: jest.fn(),
    };

    const result = await reauthenticate(instance, {
      target: '/dashboard',
      // no navigate: the window-history fallback is guarded out too
    });

    expect(result).toEqual({ success: true });
    expect(instance.setActiveAccount).toHaveBeenCalledWith({ name: 'A' });
    expect(isReauthInFlight()).toBe(false);
  });
});
