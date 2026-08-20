import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Theme system for #85 — dark-mode toggle in Settings.
 *
 * Three logical states are tracked:
 *   - `mode`  : what the user asked for. 'light', 'dark', or 'os'.
 *   - `theme` : the effective Bootstrap theme currently applied. Always
 *               'light' or 'dark'. When `mode === 'os'` this resolves
 *               from `prefers-color-scheme` and follows OS changes.
 *
 * Persistence: `mode` is stored in localStorage under the key
 * `theme-mode`. Missing/invalid values fall back to 'os'.
 *
 * The active theme is mirrored to `<html data-bs-theme="...">` so the
 * Bootstrap 5.3 theme tokens (body bg, navbar palette, modal chrome,
 * form controls, etc.) cascade everywhere without per-component work.
 * The inline boot script in `index.html` performs the same assignment
 * synchronously before React mounts to avoid a flash of the wrong theme
 * on first paint.
 */

export const THEME_STORAGE_KEY = 'theme-mode';
const OS_QUERY = '(prefers-color-scheme: dark)';

function readStoredMode() {
  if (typeof window === 'undefined') return 'os';
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'os') return value;
  } catch (_) {
    // localStorage can throw (private mode, disabled). Treat as no choice.
  }
  return 'os';
}

function writeStoredMode(mode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch (_) {
    // Ignore write errors — toggle still works for the current session.
  }
}

function detectOsTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia(OS_QUERY).matches ? 'dark' : 'light';
}

function resolveTheme(mode, osTheme) {
  return mode === 'os' ? osTheme : mode;
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readStoredMode);
  const [osTheme, setOsTheme] = useState(detectOsTheme);
  const theme = resolveTheme(mode, osTheme);

  // Mirror the effective theme to <html data-bs-theme> for Bootstrap 5.3.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-bs-theme', theme);
  }, [theme]);

  // When the user is in 'os' mode, follow live OS preference changes.
  // When they have made an explicit choice we ignore OS flips so their
  // preference is not silently overridden by an OS theme swap.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (mode !== 'os') return undefined;
    const mq = window.matchMedia(OS_QUERY);
    const handler = (event) => setOsTheme(event.matches ? 'dark' : 'light');
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    // Older Safari (pre-14) only supports the deprecated addListener API.
    if (typeof mq.addListener === 'function') {
      mq.addListener(handler);
      return () => mq.removeListener(handler);
    }
    return undefined;
  }, [mode]);

  const setMode = useCallback((next) => {
    if (next !== 'light' && next !== 'dark' && next !== 'os') return;
    setModeState(next);
    writeStoredMode(next);
    if (next !== 'os') setOsTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setMode]);

  const resetToOsPreference = useCallback(() => {
    setMode('os');
  }, [setMode]);

  const value = useMemo(
    () => ({ theme, mode, setMode, toggleTheme, resetToOsPreference }),
    [theme, mode, setMode, toggleTheme, resetToOsPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}