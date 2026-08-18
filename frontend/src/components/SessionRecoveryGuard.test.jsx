import React from 'react';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useMsal } from '@azure/msal-react';
import { MemoryRouter } from 'react-router';
import SessionRecoveryGuard from './SessionRecoveryGuard';
import {
  notifySessionExpired,
  onSessionExpired,
} from '@/api/errors';
import { reauthenticate, _resetReauthStateForTests } from '@/auth/authFlow';
import appInsights from '@/log/appInsights';
import notyfService from '@/log/notyfService';

jest.mock('@/auth/authFlow', () => ({
  reauthenticate: jest.fn().mockResolvedValue({ success: true }),
  isReauthInFlight: jest.fn().mockReturnValue(false),
  _resetReauthStateForTests: jest.fn(),
}));

// react-router's hooks aren't jest mocks in the global setup, so we
// provide explicit spies for useNavigate that each test can rewire.
const mockUseNavigate = jest.fn();
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useNavigate: () => mockUseNavigate(),
}));

const silentConsoleError = () => {
  const original = console.error;
  console.error = jest.fn();
  return () => { console.error = original; };
};

const mockMsalInstance = () => ({
  getActiveAccount: jest.fn(),
  loginPopup: jest.fn(),
  setActiveAccount: jest.fn(),
});

const renderGuard = ({ msalInstance, navigate } = {}) => {
  if (msalInstance) {
    useMsal.mockReturnValue({ instance: msalInstance });
  }
  const nav = navigate || jest.fn();
  mockUseNavigate.mockReturnValue(nav);

  let utils;
  act(() => {
    utils = render(
      <MemoryRouter>
        <SessionRecoveryGuard />
      </MemoryRouter>
    );
  });
  return { ...utils, navigate: nav };
};

describe('SessionRecoveryGuard', () => {
  let originalSessionStorageClear;
  let restoreConsole;
  let mockNavigate;

  beforeEach(() => {
    jest.clearAllMocks();
    restoreConsole = silentConsoleError();
    if (typeof window !== 'undefined') {
      try { window.sessionStorage.clear(); } catch (_) { /* noop */ }
      window.__uwsRecoveryInFlight = false;
    }
    _resetReauthStateForTests();
    mockNavigate = jest.fn();
    mockUseNavigate.mockReturnValue(mockNavigate);
    // Default MSAL mock
    useMsal.mockReturnValue({ instance: mockMsalInstance() });
  });
  afterEach(() => {
    restoreConsole();
  });

  it('renders nothing', () => {
    const { container } = renderGuard();
    expect(container.firstChild).toBeNull();
  });

  it('calls reauthenticate with the current location when a session-expired event fires', async () => {
    const instance = mockMsalInstance();
    // Pretend the user is on /dashboard?tab=1
    window.history.pushState({}, '', '/dashboard?tab=1');

    renderGuard({ msalInstance: instance, navigate: mockNavigate });

    await act(async () => {
      notifySessionExpired({ source: '/api/user-data' });
    });

    expect(reauthenticate).toHaveBeenCalledTimes(1);
    const call = reauthenticate.mock.calls[0];
    expect(call[0]).toBe(instance);
    expect(call[1].target).toBe('/dashboard?tab=1');
    expect(call[1].navigate).toBe(mockNavigate);
  });

  it('survives reauthenticate failure and emits telemetry', async () => {
    const instance = mockMsalInstance();
    reauthenticate.mockResolvedValueOnce({
      success: false,
      error: new Error('popup closed'),
    });
    renderGuard({ msalInstance: instance });

    await act(async () => {
      notifySessionExpired({ source: '/api/foo' });
    });

    // Wait for the inner .then() to run.
    await act(async () => { await Promise.resolve(); });

    expect(appInsights.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'SessionRecoveryGuard - Triggered' })
    );
  });

  it('emits telemetry on triggering', async () => {
    const instance = mockMsalInstance();
    renderGuard({ msalInstance: instance });

    await act(async () => {
      notifySessionExpired({ source: '/api/admin-data' });
    });

    expect(appInsights.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'SessionRecoveryGuard - Triggered' })
    );
  });

  it('does not throw when no navigate is supplied (legacy/test mode)', async () => {
    // Although SessionRecoveryGuard is always rendered inside <BrowserRouter>,
    // we still want the component to call reauthenticate with whatever was
    // provided.
    const instance = mockMsalInstance();
    mockUseNavigate.mockReturnValue(undefined);
    renderGuard({ msalInstance: instance });

    await act(async () => {
      notifySessionExpired({ source: '/api/foo' });
    });

    expect(reauthenticate).toHaveBeenCalledTimes(1);
  });

  it('tolerates notyfService throwing', async () => {
    const instance = mockMsalInstance();
    notyfService.info = jest.fn(() => { throw new Error('boom'); });
    renderGuard({ msalInstance: instance });

    await act(async () => {
      notifySessionExpired({ source: '/api/foo' });
    });

    expect(reauthenticate).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', async () => {
    const instance = mockMsalInstance();

    // Subscribe a side-channel handler first — this lets us observe that
    // *something* is still subscribed before/after the guard mounts and
    // unmounts. The actual cleanup is exercised by the guard calling the
    // unsubscribe function it received from onSessionExpired at mount time.
    //
    // Rather than spyOn (which is restricted on ES module exports), we
    // verify via observable side-effects: after unmount, firing the bus
    // should no longer call reauthenticate.
    const { unmount } = render(
      <MemoryRouter>
        <SessionRecoveryGuard />
      </MemoryRouter>
    );

    unmount();

    // Fire the bus again — no handlers from the unmounted guard should be
    // listening anymore.
    await act(async () => {
      notifySessionExpired({ source: '/api/post-unmount' });
    });

    expect(reauthenticate).not.toHaveBeenCalled();
  });
});
