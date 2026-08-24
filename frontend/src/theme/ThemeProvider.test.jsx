import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, useTheme, THEME_STORAGE_KEY } from '@/theme/ThemeProvider';

// Helper: drive the JSDOM matchMedia stub (installed in jest.setup.js).
const setOsDark = (matches) => {
  if (typeof window !== 'undefined' && typeof window.__setMatchMediaDark === 'function') {
    window.__setMatchMediaDark(matches);
  }
};

// A small consumer component that exposes the current context values
// via data-testid attributes. Keeps the assertions in these tests
// independent of the Settings page.
const ThemeProbe = () => {
  const { theme, mode, resetToOsPreference } = useTheme();
  return (
    <div>
      <span data-testid="probe-theme">{theme}</span>
      <span data-testid="probe-mode">{mode}</span>
      <button type="button" data-testid="probe-reset" onClick={resetToOsPreference}>
        reset
      </button>
    </div>
  );
};

const renderProbe = (initialStoredMode) => {
  if (initialStoredMode === null || initialStoredMode === undefined) {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } else {
    window.localStorage.setItem(THEME_STORAGE_KEY, initialStoredMode);
  }
  return render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );
};

describe('ThemeProvider — defaults and helpers (issue #129)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setOsDark(false); // OS defaults to light in every test unless overridden
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-bs-theme');
  });

  test('a first visit with no stored preference renders dark', () => {
    setOsDark(false); // OS light — must NOT participate for a first-time visitor
    renderProbe();
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('probe-mode')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  test('a first visit with no stored preference still renders dark when OS prefers dark', () => {
    // Same outcome, opposite OS — the resolution path is 'default = dark',
    // not 'follow OS and happen to be dark'.
    setOsDark(true);
    renderProbe();
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('probe-mode')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  test('a stored "light" choice still wins for an existing user', () => {
    setOsDark(true); // OS would prefer dark — stored choice must still win
    renderProbe('light');
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('light');
    expect(screen.getByTestId('probe-mode')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
  });

  test('a stored "dark" choice still wins for an existing user', () => {
    setOsDark(false); // OS would prefer light — stored choice must still win
    renderProbe('dark');
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('probe-mode')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  test('a stored "os" choice is preserved and resolves via prefers-color-scheme', () => {
    setOsDark(false);
    renderProbe('os');
    expect(screen.getByTestId('probe-mode')).toHaveTextContent('os');
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('light');

    act(() => {
      setOsDark(true);
    });

    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');
  });

  test('a stored value that is not one of light/dark/os is treated as no choice → dark', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'midnight');
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('probe-mode')).toHaveTextContent('dark');
  });

  test('resetToOsPreference still works after #129', () => {
    setOsDark(false);
    renderProbe('dark');
    expect(screen.getByTestId('probe-mode')).toHaveTextContent('dark');

    act(() => {
      screen.getByTestId('probe-reset').click();
    });

    expect(screen.getByTestId('probe-mode')).toHaveTextContent('os');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('os');
  });

  test('OS preference changes propagate when explicitly in "os" mode', () => {
    setOsDark(false);
    renderProbe('os');
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('light');

    act(() => {
      setOsDark(true);
    });

    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');
  });

  test('OS preference changes are ignored when an explicit non-os choice is set', () => {
    setOsDark(false);
    renderProbe('dark');
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');

    act(() => {
      setOsDark(true);
    });

    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');
  });
});

describe('ThemeProvider — localStorage-throws path (issue #129)', () => {
  let originalGetItem;
  let originalSetItem;

  beforeEach(() => {
    jest.clearAllMocks();
    setOsDark(false);
    document.documentElement.removeAttribute('data-bs-theme');

    originalGetItem = window.localStorage.getItem;
    originalSetItem = window.localStorage.setItem;
  });

  afterEach(() => {
    window.localStorage.getItem = originalGetItem;
    window.localStorage.setItem = originalSetItem;
  });

  test('renders dark when localStorage.getItem throws (private mode / disabled)', () => {
    // Simulate the storage-throws path that a Safari private window or
    // a locked-down corporate browser triggers on every getItem call.
    window.localStorage.getItem = () => {
      throw new Error('SecurityError: storage access denied');
    };

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');
    expect(screen.getByTestId('probe-mode')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  test('renders dark when localStorage.setItem throws but getItem still works', () => {
    // getItem returns nothing (simulating first visit), setItem throws —
    // the user can still toggle for the current session and lands on dark.
    window.localStorage.getItem = () => null;
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });
});