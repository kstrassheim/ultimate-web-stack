import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Settings from './Settings';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { THEME_STORAGE_KEY } from '@/theme/ThemeProvider';
import appInsights from '@/log/appInsights';

// Mock appInsights so we don't depend on the Application Insights
// transport in tests.
jest.mock('@/log/appInsights', () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn(),
}));

// Helper: drive the JSDOM matchMedia stub (installed in jest.setup.js).
const setOsDark = (matches) => {
  if (typeof window !== 'undefined' && typeof window.__setMatchMediaDark === 'function') {
    window.__setMatchMediaDark(matches);
  }
};

const renderSettings = (initialStoredMode) => {
  if (initialStoredMode === null || initialStoredMode === undefined) {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } else {
    window.localStorage.setItem(THEME_STORAGE_KEY, initialStoredMode);
  }
  return render(
    <ThemeProvider>
      <Settings />
    </ThemeProvider>,
  );
};

describe('Settings — theme toggle (issue #85)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setOsDark(false); // OS defaults to light in every test unless overridden
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-bs-theme');
  });

  test('renders the page and the dark-mode switch', () => {
    renderSettings();
    expect(screen.getByTestId('settings-page')).toBeInTheDocument();
    expect(screen.getByTestId('settings-heading')).toHaveTextContent('Settings');
    expect(screen.getByTestId('settings-dark-mode-switch')).toBeInTheDocument();
  });

  test('first visit with empty localStorage renders dark by default (issue #129)', () => {
    // Per #129: a first-time visitor sees dark regardless of OS preference.
    // OS preference no longer participates unless the user opts in via
    // 'Follow my OS preference' in Settings.
    setOsDark(false); // OS is light
    renderSettings();
    const toggle = screen.getByTestId('settings-dark-mode-switch');
    expect(toggle).toBeChecked();
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  test('first visit with empty localStorage renders dark even when OS prefers dark', () => {
    // OS prefers dark here too, but the outcome (dark + 'Dark' mode
    // badge) is the same path: the new default is dark, not 'follow OS'.
    setOsDark(true);
    renderSettings();
    const toggle = screen.getByTestId('settings-dark-mode-switch');
    expect(toggle).toBeChecked();
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  test('toggling the switch swaps theme immediately and persists the choice', () => {
    // Default mode is now 'dark' (#129), so the toggle starts ON.
    setOsDark(false);
    renderSettings();

    const toggle = screen.getByTestId('settings-dark-mode-switch');
    expect(toggle).toBeChecked();

    // Flip to light.
    act(() => {
      toggle.click();
    });
    expect(toggle).not.toBeChecked();
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    // Flip back to dark.
    act(() => {
      toggle.click();
    });
    expect(toggle).toBeChecked();
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  test('stored "dark" choice wins over an OS light preference', () => {
    setOsDark(false);
    renderSettings('dark');
    const toggle = screen.getByTestId('settings-dark-mode-switch');
    expect(toggle).toBeChecked();
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  test('stored "light" choice wins over an OS dark preference', () => {
    setOsDark(true);
    renderSettings('light');
    const toggle = screen.getByTestId('settings-dark-mode-switch');
    expect(toggle).not.toBeChecked();
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Light');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
  });

  test('"Follow my OS preference" button appears on first visit (mode is not "os")', () => {
    // Per #129: the default mode is 'dark' (not 'os'), so the button
    // is offered up front — a first-time visitor can opt into following
    // the OS without first having to pick a manual theme.
    setOsDark(false);
    renderSettings(); // no stored mode
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Dark');
    expect(screen.getByTestId('settings-follow-os-button')).toBeInTheDocument();
  });

  test('"Follow my OS preference" button is hidden while explicitly following OS', () => {
    // An existing user who explicitly chose 'os' mode still sees the
    // original behavior — the button is hidden because they're already
    // following the OS and there is nothing to "return" to.
    setOsDark(false);
    renderSettings('os');
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Follow OS');
    expect(screen.queryByTestId('settings-follow-os-button')).not.toBeInTheDocument();
  });

  test('"Follow my OS preference" returns to OS mode and is hidden afterwards', () => {
    setOsDark(true);
    renderSettings('light'); // start with an explicit light override
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Light');
    const followBtn = screen.getByTestId('settings-follow-os-button');
    expect(followBtn).toBeInTheDocument();

    act(() => {
      fireEvent.click(followBtn);
    });

    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Follow OS');
    // Now resolves to OS dark.
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('os');
    // Button disappears once we're back to OS mode.
    expect(screen.queryByTestId('settings-follow-os-button')).not.toBeInTheDocument();
  });

  test('toggling emits a telemetry event', () => {
    renderSettings('light');
    const toggle = screen.getByTestId('settings-dark-mode-switch');
    act(() => {
      toggle.click();
    });
    expect(appInsights.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Settings - Theme toggled',
        properties: expect.objectContaining({ to: 'dark' }),
      }),
    );
  });

  test('survives a simulated full reload: stored mode is read on mount', () => {
    // Simulate the user choosing dark and the page being reloaded.
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(
      <ThemeProvider>
        <Settings />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('settings-dark-mode-switch')).toBeChecked();
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  test('OS preference changes propagate when mode is explicitly "os"', () => {
    // Per #129: default mode is 'dark', not 'os'. To exercise the
    // OS-following branch we have to seed 'os' into localStorage so
    // the user has actually opted in.
    setOsDark(false);
    renderSettings('os');
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Follow OS');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');

    act(() => {
      setOsDark(true);
    });

    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
    expect(screen.getByTestId('settings-dark-mode-switch')).toBeChecked();
  });

  test('a previously stored light choice still wins on a first visit after #129', () => {
    // #129 acceptance: "An existing stored choice still wins — someone
    // who previously selected light stays on light. Do not clear or
    // migrate theme-mode values already in localStorage."
    setOsDark(true); // OS would prefer dark, but the stored choice wins
    renderSettings('light');
    const toggle = screen.getByTestId('settings-dark-mode-switch');
    expect(toggle).not.toBeChecked();
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Light');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
  });

  test('a previously stored dark choice still wins on a first visit after #129', () => {
    setOsDark(false); // OS would prefer light, but the stored choice wins
    renderSettings('dark');
    const toggle = screen.getByTestId('settings-dark-mode-switch');
    expect(toggle).toBeChecked();
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  test('a previously stored "os" choice still wins on a first visit after #129', () => {
    // Stored 'os' must keep working — #129 only changes the default
    // for *new* visitors, not for users who already opted into OS mode.
    setOsDark(false);
    renderSettings('os');
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Follow OS');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');

    // Flip the OS and confirm we still follow it.
    act(() => {
      setOsDark(true);
    });
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  test('OS preference changes are ignored when an explicit choice is set', () => {
    setOsDark(false);
    renderSettings('dark'); // explicit dark, OS starts light
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');

    act(() => {
      setOsDark(true); // OS flips to dark — must not affect explicit choice
    });

    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
    expect(screen.getByTestId('settings-dark-mode-switch')).toBeChecked();
  });
});