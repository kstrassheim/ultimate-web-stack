/**
 * @jest-environment node
 *
 * The no-window halves of ThemeProvider's SSR guards. jsdom (the
 * suite-wide environment) always defines `window`, so
 * `readStoredMode`'s and `detectOsTheme`'s first arms can only execute
 * under the plain node environment, via a server render.
 * (`writeStoredMode`'s no-window arm and the effect-time document guard
 * stay unreachable even here — SSR runs no effects and no callbacks —
 * those two carry narrowly-scoped istanbul ignores in the source.)
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, useTheme } from './ThemeProvider';

describe('ThemeProvider under SSR (no window)', () => {
  const Probe = () => {
    const { theme, mode } = useTheme();
    return React.createElement('span', null, `${mode}/${theme}`);
  };

  it('falls back to the safe dark default for both the stored mode and the OS detection', () => {
    expect(typeof window).toBe('undefined');

    const html = renderToString(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(html).toContain('dark/dark');
  });
});
