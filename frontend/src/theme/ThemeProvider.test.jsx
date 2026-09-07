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

describe('ThemeProvider — OS-detection and listener edge paths', () => {
  let originalMatchMedia;

  beforeEach(() => {
    jest.clearAllMocks();
    setOsDark(false);
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-bs-theme');
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  test('falls back to dark when window.matchMedia is unavailable entirely', () => {
    // Pre-flight jsdom and genuinely old browsers have no matchMedia at
    // all: detectOsTheme must return the safe default instead of throwing,
    // and the OS-follow effect must bail out instead of subscribing.
    delete window.matchMedia;
    window.localStorage.setItem(THEME_STORAGE_KEY, 'os');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('probe-mode')).toHaveTextContent('os');
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
  });

  test('follows OS changes through the legacy addListener API (pre-14 Safari)', () => {
    const listeners = new Set();
    const legacyMql = {
      matches: true,
      media: '(prefers-color-scheme: dark)',
      // Deliberately NO addEventListener/removeEventListener — this is the
      // deprecated MediaQueryList shape the fallback branch exists for.
      addListener: (cb) => listeners.add(cb),
      removeListener: (cb) => listeners.delete(cb),
    };
    window.matchMedia = () => legacyMql;
    window.localStorage.setItem(THEME_STORAGE_KEY, 'os');

    const { unmount } = render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    // Initial resolution came from the legacy `.matches` read.
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');
    expect(listeners.size).toBe(1);

    // A legacy change event to light is honoured...
    act(() => {
      listeners.forEach((cb) => cb({ matches: false, media: legacyMql.media }));
    });
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('light');

    // ...and back to dark, exercising both arms of the handler ternary.
    act(() => {
      listeners.forEach((cb) => cb({ matches: true, media: legacyMql.media }));
    });
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');

    // Unmount removes the legacy listener.
    unmount();
    expect(listeners.size).toBe(0);
  });

  test('tolerates a matchMedia result with no listener API at all', () => {
    // A MediaQueryList with neither addEventListener nor addListener: the
    // effect must give up cleanly and serve the static OS reading.
    window.matchMedia = () => ({ matches: false, media: '(prefers-color-scheme: dark)' });
    window.localStorage.setItem(THEME_STORAGE_KEY, 'os');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('probe-mode')).toHaveTextContent('os');
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('light');
  });

  test('an OS flip to light propagates when in os mode (dark → light direction)', () => {
    // The existing suite only walks light → dark; the handler ternary's
    // dark arm needs the reverse transition too.
    setOsDark(true);
    renderProbe('os');
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');

    act(() => {
      setOsDark(false);
    });

    expect(screen.getByTestId('probe-theme')).toHaveTextContent('light');
  });
});
describe('ThemeProvider — setMode validation, toggleTheme and context guard', () => {
  // Probe variant exposing setMode and toggleTheme in addition to the
  // values the shared ThemeProbe already exposes.
  const ControlProbe = () => {
    const { theme, mode, setMode, toggleTheme } = useTheme();
    return (
      <div>
        <span data-testid="probe-theme">{theme}</span>
        <span data-testid="probe-mode">{mode}</span>
        <button type="button" data-testid="probe-toggle" onClick={toggleTheme}>toggle</button>
        <button type="button" data-testid="probe-setmode-invalid" onClick={() => setMode('midnight')}>invalid</button>
      </div>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setOsDark(false);
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-bs-theme');
  });

  test('toggleTheme flips dark → light → dark and persists each choice', () => {
    render(
      <ThemeProvider>
        <ControlProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');

    act(() => {
      screen.getByTestId('probe-toggle').click();
    });
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('light');
    expect(screen.getByTestId('probe-mode')).toHaveTextContent('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    act(() => {
      screen.getByTestId('probe-toggle').click();
    });
    expect(screen.getByTestId('probe-theme')).toHaveTextContent('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  test('setMode ignores values outside light/dark/os', () => {
    render(
      <ThemeProvider>
        <ControlProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('probe-mode')).toHaveTextContent('dark');

    act(() => {
      screen.getByTestId('probe-setmode-invalid').click();
    });

    // Nothing changed: no state update, no persistence.
    expect(screen.getByTestId('probe-mode')).toHaveTextContent('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  test('useTheme throws a descriptive error outside a ThemeProvider', () => {
    // React logs render errors noisily; swallow them for this assertion.
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(<ThemeProbe />)).toThrow(
        'useTheme must be used inside <ThemeProvider>',
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
