import { Card, Form } from 'react-bootstrap';
import { useTheme } from '@/theme/ThemeProvider';
import appInsights from '@/log/appInsights';
import './Settings.css';

/**
 * Settings page — exposes a dark-mode toggle wired into the global
 * ThemeProvider. The switch reflects the *effective* theme (so it
 * also works correctly when the user has no explicit choice and the
 * page is rendering in dark because their OS prefers dark).
 *
 * Acceptance criteria for issue #85:
 *   1. Toggling the switch swaps light↔dark immediately, no reload.
 *   2. The choice is written to localStorage so a full reload keeps it.
 *   3. With no stored choice, the OS preference is followed — and a
 *      "Follow my OS preference" button is offered so users who picked
 *      manually can return to auto.
 */
const Settings = () => {
  const { theme, mode, setMode, resetToOsPreference } = useTheme();
  const isDark = theme === 'dark';

  const handleThemeToggle = (event) => {
    const next = event.target.checked ? 'dark' : 'light';
    appInsights.trackEvent({
      name: 'Settings - Theme toggled',
      properties: { from: mode, to: next },
    });
    setMode(next);
  };

  const handleFollowOs = () => {
    appInsights.trackEvent({
      name: 'Settings - Reset to OS preference',
      properties: { previousMode: mode },
    });
    resetToOsPreference();
  };

  return (
    <div data-testid="settings-page">
      <h1 data-testid="settings-heading">Settings</h1>

      <Card className="mb-4" data-bs-theme={theme} data-testid="settings-appearance-card">
        <Card.Header data-testid="settings-appearance-header">Appearance</Card.Header>
        <Card.Body>
          <div
            className="d-flex justify-content-between align-items-center"
            data-testid="settings-theme-row"
          >
            <div>
              <Form.Label
                htmlFor="settings-dark-mode-switch"
                className="fw-semibold mb-1"
                data-testid="settings-theme-label"
              >
                Dark mode
              </Form.Label>
              <div className="text-muted small" data-testid="settings-theme-help">
                {isDark
                  ? 'The interface is currently using the dark palette.'
                  : 'The interface is currently using the light palette.'}
              </div>
            </div>
            <Form.Check
              type="switch"
              id="settings-dark-mode-switch"
              name="dark-mode"
              aria-label="Toggle dark mode"
              checked={isDark}
              onChange={handleThemeToggle}
              data-testid="settings-dark-mode-switch"
            />
          </div>

          <hr className="my-3" />

          <div data-testid="settings-current-mode">
            <span className="text-muted small me-2">Current mode:</span>
            <span data-testid="settings-current-mode-value" className="badge bg-secondary">
              {mode === 'os' ? 'Follow OS' : mode === 'dark' ? 'Dark' : 'Light'}
            </span>
          </div>

          {mode !== 'os' && (
            <button
              type="button"
              className="btn btn-link p-0 mt-2"
              onClick={handleFollowOs}
              data-testid="settings-follow-os-button"
            >
              Follow my OS preference
            </button>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default Settings;