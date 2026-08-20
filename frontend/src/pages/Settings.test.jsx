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

  test('reflects OS light preference when no choice has been made', () => {
    setOsDark(false);
    renderSettings(); // no stored mode
    const toggle = screen.getByTestId('settings-dark-mode-switch');
    expect(toggle).not.toBeChecked();
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Follow OS');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
  });

  test('reflects OS dark preference when no choice has been made', () => {
    setOsDark(true);
    renderSettings(); // no stored mode
    const toggle = screen.getByTestId('settings-dark-mode-switch');
    expect(toggle).toBeChecked();
    expect(screen.getByTestId('settings-current-mode-value')).toHaveTextContent('Follow OS');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  test('toggling the switch swaps theme immediately and persists the choice', () => {
    setOsDark(false);
    renderSettings();

    const toggle = screen.getByTestId('settings-dark-mode-switch');
    expect(toggle).not.toBeChecked();

    // Flip to dark.
    act(() => {
      toggle.click();
    });
    expect(toggle).toBeChecked();
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    // Flip back to light.
    act(() => {
      toggle.click();
    });
    expect(toggle).not.toBeChecked();
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
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

  test('"Follow my OS preference" button is hidden while already following OS', () => {
    setOsDark(false);
    renderSettings(); // mode defaults to os
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

  test('OS preference changes propagate when mode is "os"', () => {
    setOsDark(false);
    renderSettings(); // no stored mode → follows OS
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');

    act(() => {
      setOsDark(true);
    });

    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
    expect(screen.getByTestId('settings-dark-mode-switch')).toBeChecked();
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