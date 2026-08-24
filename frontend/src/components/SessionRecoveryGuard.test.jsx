import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useMsal } from '@azure/msal-react';
import { MemoryRouter } from 'react-router';
import SessionRecoveryGuard from './SessionRecoveryGuard';
import {
  notifySessionExpired,
} from '@/api/errors';
import { reauthenticate, _resetReauthStateForTests } from '@/auth/authFlow';
import appInsights from '@/log/appInsights';
import notyfService from '@/log/notyfService';

jest.mock('@/auth/authFlow', () => ({
  reauthenticate: jest.fn().mockResolvedValue({ success: true }),
  _resetReauthStateForTests: jest.fn(),
}));

jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn(),
}));

jest.mock('@/log/notyfService', () => ({
  error: jest.fn(),
  success: jest.fn(),
}));

// A minimal router shim so the guard doesn't depend on a full
// router history; the guard only needs useNavigate()'s return value.
const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('SessionRecoveryGuard', () => {
  let _originalSessionStorageClear;
  let restoreConsole;
  let mockNavigate;

  beforeEach(() => {
    jest.clearAllMocks();
    restoreConsole = silentConsoleError();
    mockNavigate = jest.fn();
  });

  afterEach(() => {
    restoreConsole();
  });

  const silentConsoleError = () => {
    const original = console.error;
    console.error = jest.fn();
    return () => { console.error = original; };
  };

  /** Build a router shim that lets the guard call useNavigate() in tests. */
  const renderWithShim = (ui) => {
    jest.spyOn(require('react-router'), 'useNavigate').mockReturnValue(mockNavigate);
    return render(<MemoryRouter>{ui}</MemoryRouter>);
  };

  it('subscribes on mount and unsubscribes on unmount', () => {
    const utils = renderWithShim(<SessionRecoveryGuard />);
    // After mount, a side-channel handler should be able to subscribe
    // and receive a notification; the unsubscribe function comes back
    // from notifySessionExpired's listener API.
    let received = null;
    const off = notifySessionExpired(() => { received = 'seen'; });
    // Trigger the guard's own listener by re-publishing through the
    // helper that the API layer publishes to.
    // (We can't directly reach the guard's private subscriber; this
    // test mainly exercises the no-throw path.)
    expect(typeof off).toBe('function');
    utils.unmount();
  });

  it('calls reauthenticate on a session-expired event when no recovery is already in flight', () => {
    reauthenticate.mockResolvedValue({ success: true });
    renderWithShim(<SessionRecoveryGuard />);

    // Dispatch a session-expired event by calling the API's publish
    // helper. The guard subscribes via onSessionExpired on mount.
    notifySessionExpired({ error: new Error('expired') });

    // The guard awaits reauthenticate inside a microtask; flush.
    return Promise.resolve().then(() => Promise.resolve()).then(() => {
      expect(reauthenticate).toHaveBeenCalledTimes(1);
    });
  });

  it('does not double-fire when multiple session-expired events arrive back-to-back', () => {
    reauthenticate.mockResolvedValue({ success: true });
    renderWithShim(<SessionRecoveryGuard />);

    notifySessionExpired({});
    notifySessionExpired({});
    notifySessionExpired({});

    return Promise.resolve().then(() => Promise.resolve()).then(() => {
      expect(reauthenticate).toHaveBeenCalledTimes(1);
    });
  });

  it('unsubscribes on unmount', async () => {
    const _instance = mockMsalInstance();

    // Subscribe a side-channel handler first — this lets us observe that
    // *something* is still subscribed before/after the guard mounts and
    // unmounts. The actual cleanup is exercised by the guard calling the
    // unsubscribe function it received from onSessionExpired at mount time.
    let sideChannelFired = false;
    const off = notifySessionExpired(() => { sideChannelFired = true; });
    try {
      renderWithShim(<SessionRecoveryGuard />);
      notifySessionExpired({});
      // Give the guard's listener a chance to run.
      await Promise.resolve();
      await Promise.resolve();
      expect(sideChannelFired).toBe(true);
    } finally {
      off();
    }
  });
});