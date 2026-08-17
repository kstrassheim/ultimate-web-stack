# Testing & Mocking Architecture

> Audience: an AI agent (or engineer) that needs to reason about, run, or extend
> the test suites in this repository. This document describes **how** mocking is
> wired, **where** the seams are, and the **rules** that must be preserved — most
> importantly that E2E tests exercise the real stack and never stub the network.

## TL;DR

- **Mocking is a build/config concern, not a test-runtime concern.** Application
  code is never edited or wrapped for tests. Instead, module resolution is
  redirected to `mock/` implementations by the bundler (Vite) and the unit-test
  runner (Jest). The app imports the same specifiers in every mode.
- **The frontend swaps only the outer boundaries**: the identity provider
  (`@azure/msal-browser`), Microsoft Graph, App Insights, and the Terraform
  config. Everything the app actually does with those is real.
- **The backend swaps only the last DB layer.** `MockFutureGadgetLabDataService`
  subclasses the real service and overrides **only** database initialization to
  use an in-memory TinyDB. Every CRUD path, payload preparation, and business
  calculation runs the production code.
- **E2E (Cypress) runs the real stack**: the real Vite build against a real
  FastAPI backend (both in mock mode), so HTTP, serialization, auth plumbing, and
  business logic are genuinely exercised. Only Cosmos DB, Azure AD, and telemetry
  are faked.
- **Network stubbing in E2E is the exception, not the rule.** A handful of specs
  still use `cy.intercept` with canned bodies to force error paths — see
  [Current `cy.intercept` usage](#current-cyintercept-usage) for the inventory and
  the rule new specs must follow.

## The three test layers

| Layer | Runner | Location | Mode | What is faked |
|-------|--------|----------|------|---------------|
| Frontend unit | Jest (jsdom + `@swc/jest`) | `frontend/src/**/*.test.{js,jsx}` | `moduleNameMapper` | styles, static assets, terraform config (per test as needed) |
| Backend unit | pytest | `backend/**/*_test.py` | `MOCK=true` (via `conftest.py`) | DB → TinyDB, auth scheme, telemetry exporter |
| End-to-end | Cypress (Edge, headless in CI) | `frontend/cypress/e2e/**/*.cy.js` | full stack in mock mode | only MSAL/Azure AD, Cosmos DB, App Insights |

## Core principle: transparent mocking

The mock implementations live next to production code and expose the **same
public surface**, so nothing downstream knows it is talking to a mock:

- `frontend/mock/` — JS mock modules mapped in over real imports.
- `backend/mock/` — Python mock classes that subclass the real ones.

Selection is driven by a single flag per side:

- Frontend: `npm_config_mock=true` (set by the `--mock` npm flag / the
  `test:frontend` script) and the Jest `moduleNameMapper`.
- Backend: the `MOCK` environment variable (`true`/`false`).

## Frontend mocking (transparent via Vite / Jest — no interception)

### Vite (dev server + E2E build)

`frontend/vite.config.js` reads `process.env.npm_config_mock`. When mocking is
enabled, `getAliases()` returns resolver aliases that redirect real import
specifiers to files under `frontend/mock/`:

```js
// vite.config.js — getAliases(), only when isMockEnabled
'@azure/msal-browser/redirect-bridge': resolve(__dirname, 'mock/azureMsalRedirectBridge.js'),
'@azure/msal-browser':                  resolve(__dirname, 'mock/azureMsalBrowser.js'),
'@/../terraform.config.json':           resolve(__dirname, 'mock/terraform.mock.config.json'),
'@/log/appInsights':                    resolve(__dirname, 'mock/appInsights.js'),
'../log/appInsights':                   resolve(__dirname, 'mock/appInsights.js'),
'@/api/graphApi':                       resolve(__dirname, 'mock/graphApi.js'),
```

This is the **transparent mapping**: `src/` code keeps importing
`@azure/msal-browser`, `@/api/graphApi`, etc.; Vite resolves those specifiers to
the mock files at bundle time. There is no conditional inside application code.

The config also exposes a compile-time flag `__MOCK__` (via `define`) and points
`__PROD_URI__` / `__PROD_SOCKET_URI__` at `localhost` for local/E2E runs.

> Note: the backend API client (`src/api/api.js`) is **not** aliased to a mock in
> E2E — that is deliberate. In E2E the real client calls the real backend. The
> `frontend/mock/api.js` mock exists for isolated unit tests that opt into it.

### Jest (frontend unit tests)

`frontend/jest.config.cjs` mirrors the same idea with `moduleNameMapper`, so unit
tests resolve the same mock seams without a browser or bundler:

```js
moduleNameMapper: {
  "^@/../terraform.config.json$": "<rootDir>/mock/terraform.mock.config.json",
  "^@/.*\\.css$":                 "<rootDir>/mock/styleMock.js",
  "\\.(css|less|sass|scss)$":     "<rootDir>/mock/styleMock.js",
  "\\.(jpg|jpeg|png|gif|svg)$":   "<rootDir>/mock/fileMock.js",
  "^@/(.*)$":                      "<rootDir>/src/$1"
}
```

`mock/` is excluded from coverage (`coveragePathIgnorePatterns`,
`collectCoverageFrom`). Coverage thresholds are enforced (80% statements/functions/
lines, 70% branches). Backend coverage has its own gate: `fail_under = 80` in
`backend/pyproject.toml`.

### Auth / identity mock

`frontend/mock/azureMsalBrowser.js` is a full drop-in `PublicClientApplication`
plus the MSAL enums/classes the app imports. It:

- loads fake identities from `mock/accounts.js` and mints unsigned mock JWTs,
- persists auth state to `localStorage`,
- selects the active account/role from a `MOCKROLE` localStorage key.

In Cypress, the custom command in `frontend/cypress/support/msalMock.js` sets that
key:

```js
Cypress.Commands.add('setMockRole', (mockRole) => {
  localStorage.setItem('MOCKROLE', mockRole);
});
```

So an E2E test picks its identity with `cy.setMockRole('Admin')` before signing in
through the real UI — no token stubbing, no intercepted auth calls.

## Backend mocking (only the last DB layer is faked)

### Config / mode selection

`backend/common/config.py` reads `MOCK` and chooses the config source:

```python
mock_enabled = os_environ.get("MOCK", "false").lower() == "true"
config_path = "mock/terraform.mock.config.json" if mock_enabled else "terraform.config.json"
```

`backend/conftest.py` forces `os.environ["MOCK"] = "true"` **before any module is
imported**, so the whole pytest suite runs in mock mode with no real Azure creds.

### The DB seam — this is the only data-layer swap

`backend/api/future_gadget_api.py` chooses the data service at import time:

```python
if mock_enabled:
    from mock.mock_future_gadget_lab_data_service import MockFutureGadgetLabDataService
    fgl_service = MockFutureGadgetLabDataService()
else:
    fgl_service = FutureGadgetLabDataService(cosmos_account_uri=..., cosmos_database=..., cosmos_container=...)
```

The mock (`backend/mock/mock_future_gadget_lab_data_service.py`) **subclasses** the
real service and overrides **only** `_initialize_db()`:

```python
class MockFutureGadgetLabDataService(FutureGadgetLabDataService):
    def _initialize_db(self) -> None:            # only this is overridden
        self.storage_backend = "tinydb"
        self.db = TinyDB(storage=MemoryStorage)  # tiny, in-memory
        self._initialize_tinydb_tables()
```

Everything else — `create_experiment`, `update_*`, `search_experiments`,
`get_latest_divergence_reading`, payload preparation, `calculate_worldline_status`,
seed data via `generate_test_data` — is the **production code path**. The real
`FutureGadgetLabDataService` already contains both a Cosmos DB backend and a TinyDB
backend behind a `storage_backend` switch; the mock simply forces the in-memory
TinyDB branch and skips the Cosmos bootstrap. Real deployments use Cosmos; tests
use the identical logic over a tiny DB.

> Why a subclass overriding one method? It guarantees the mock cannot drift from
> the real service's behavior. Only the storage boundary is replaced; all business
> logic is shared by inheritance.

### Other backend seams

- **Auth** (`backend/common/auth.py`): in `dev` + `MOCK`, the real Azure scheme is
  replaced by `mock/MockAzureAuthScheme.py`, which accepts any bearer token. This
  is what lets the mock frontend JWTs pass through in E2E.
- **Telemetry** (`backend/common/log.py`): `MockAzureExporter` replaces the real
  App Insights exporter when `mock_enabled`.

## End-to-end tests: real stack, minimal stubbing

**Rule for new specs: do not add `cy.intercept` with a stubbed response (a
`body`/`fixture`/`statusCode`) for the application's own API or WebSocket
traffic.** The purpose of E2E here is to run the whole system for real, with
fakes pushed out to the true external boundaries only. Using `cy.intercept`
purely to *observe* a real request — `cy.intercept('GET', '**/x').as('x')` plus
`cy.wait('@x')` — is fine: nothing is replaced, the real backend still answers.

### What actually runs during E2E

`frontend/package.json` orchestrates a real backend + real frontend, then Cypress:

```jsonc
"test:backend":  "cross-env MOCK=true LOG_LEVEL=CRITICAL node start-backend.js --host 0.0.0.0",
"test:frontend": "cross-env npm_config_mock=true vite --logLevel warn --port 5301 --host",
"test:e2e":      "start-server-and-test test:backend http://0.0.0.0:8100/health \"start-server-and-test test:frontend http://localhost:5301 cypress\""
```

- The **backend** is a real FastAPI process (`MOCK=true`) serving real endpoints
  over HTTP/WebSocket, backed by the in-memory TinyDB.
- The **frontend** is the real Vite app (`npm_config_mock=true`) with the mock
  aliases compiled in for MSAL/Graph/telemetry only.
- Cypress (`cypress.config.js`) drives the browser at `baseUrl:
  http://localhost:5301` and lets requests flow to `localhost:8100` for real.

So a click in the UI → real fetch/WebSocket → real FastAPI route → real service
logic → in-memory TinyDB, and back. The only things not real are the identity
provider (mock MSAL + permissive mock auth scheme), Cosmos DB (TinyDB stands in),
and App Insights.

### Why not `cy.intercept`

Intercepting would replace responses with canned fixtures, which hides exactly the
bugs E2E should catch: request shaping, serialization/deserialization, status/error
handling, auth header plumbing, WebSocket lifecycle, and the backend business logic
itself. Because the mock seams are already placed at the true external boundaries,
there is no need to stub the network — and doing so would make the test assert
against a fiction instead of the system.

Instead of intercepting, E2E tests control state through real mechanisms:
`cy.setMockRole(...)` to choose identity/role, driving the real UI to create/read/
update/delete, and asserting on what the real backend returns. Seed data comes from
`generate_test_data`, and each backend process starts with a fresh in-memory DB.

### Current `cy.intercept` usage

The suite is **not** stub-free today. 16 `cy.intercept` calls exist across four
of the six specs; `chat.cy.js` and `profile.cy.js` are already clean:

| Spec | Calls | What they do |
|------|-------|--------------|
| `dashboard.cy.js` | 7 | 3 are observe-only aliases (`worldline-status`, `worldline-history`, `divergence-readings`); the rest force `500`s on `/api/user-data`, `/api/message` and Graph `/me/memberOf`, plus one empty-history body |
| `experiments.cy.js` | 4 | canned experiment lists, an empty list, and a `500` on `GET /future-gadget-lab/lab-experiments` |
| `user.cy.js` | 4 | canned `{ message: 'Hello from API' }` responses and a `500` error case |
| `navigation.cy.js` | 1 | a `500` to exercise an error route |

Most of these exist to reach **error paths** the real mock backend will not
produce on demand. That is the one defensible reason to stub here — and even
then it is a stop-gap: a backend-side fault-injection seam (mock-mode-only) is
the better fix, because a stubbed `500` asserts against a fiction of the error
body, not the one the app really receives. Do not extend this list; when you
touch one of these specs, prefer removing the stub over copying it.

### Coverage

E2E coverage is collected with `vite-plugin-istanbul` instrumenting `src/`, and
`@cypress/code-coverage` (registered in `cypress.config.js` and
`cypress/support/e2e.js`) reports it via `nyc`. Frontend unit and E2E coverage can
be merged (`coverage:merge` / `coverage:all`).

## How to run

```bash
# Frontend unit tests
cd frontend && npm test                 # one-shot
npm run test:coverage                    # with coverage

# Backend unit tests (MOCK forced by conftest.py)
cd backend && pytest
pytest --cov=. --cov-report=xml --cov-report=html

# E2E (starts mock backend + mock frontend, then Cypress)
cd frontend
npm run test:e2e            # interactive-ish (opens runner after servers are up)
npm run test:e2e:headless  # headless Edge, closest to CI
```

CI runs all three in the GitHub Actions testing workflow `.github/workflows/dev_testing_pipeline.yml` (`backend-unit-tests`,
`frontend-unit-tests`, `e2e-tests`). See [README.md](../README.md) for the wider
pipeline layout.

## Rules for extending the mocks (checklist for an agent)

1. **Add a new external dependency to the frontend?** If it must be faked, add a
   file under `frontend/mock/`, then register it in **both**
   `vite.config.js` (`getAliases`) and `jest.config.cjs` (`moduleNameMapper`) so
   dev/E2E and unit tests resolve the same seam. Never branch on a mock flag
   inside `src/`.
2. **Keep the mock's public surface identical** to the real module — same exports,
   same signatures, same return shapes.
3. **Backend data logic changes go in the real service** (`db/…_data_service.py`),
   never duplicated into the mock. The mock overrides only storage
   initialization. If you find yourself overriding a business method in the mock,
   that logic belongs in the base class behind the `storage_backend` switch.
4. **Do not add new `cy.intercept` response stubs** for the app's own API or
   WebSocket traffic in E2E specs. Control state through the real UI and
   `cy.setMockRole`; observe-only aliases are fine. The existing stubs listed
   above are legacy — shrink that list, don't grow it.
5. **Faked boundaries are fixed**: identity/MSAL, Microsoft Graph, Cosmos DB,
   App Insights, and Terraform config. Everything between them should run for real
   in tests.
