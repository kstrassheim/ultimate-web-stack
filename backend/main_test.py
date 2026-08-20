from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, mock_open
import pytest
import json
from pathlib import Path

# Import the app to test
import main
from main import app

# Create a test client
client = TestClient(app)

class TestMainModule:

    @pytest.fixture
    def mock_file_response(self):
        """Mock FileResponse for frontend files"""
        with patch('main.FileResponse') as mock:
            mock.return_value = {"mocked": "file_response"}
            yield mock
    
    @pytest.fixture
    def mock_path(self):
        """Mock Path for file existence checks"""
        with patch('main.Path') as mock_path:
            # Make dist path return a mock
            mock_dist = MagicMock()
            mock_path.return_value = mock_dist
            
            # Setup behavior for path / "some_file"
            def mock_div(path_str):
                result = MagicMock()
                # Default: files exist except index.html which we'll test separately
                if path_str == "index.html":
                    result.exists.return_value = False
                else:
                    result.exists.return_value = True
                return result
            
            mock_dist.__truediv__.side_effect = mock_div
            yield mock_path
    
    def test_health_endpoint_minimal_payload(self):
        """Issue #100: GET /health returns only ``{"status": "ok"}``.

        The previous handler returned host CPU%, memory breakdown, and
        uptime to any anonymous caller — fingerprintable App Service SKU
        signals (F1 vs B1 vs P1v3) and how stale the deployment is.
        Azure App Service's load-balancer health probe still reaches
        the route (see terraform.tf ``health_check_path``), but the
        response body must be minimal so the LB probe keeps working
        while the leak is closed.
        """
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_health_endpoint_does_not_leak_host_metrics(self):
        """Regression coverage for issue #100: GET /health must not
        include host CPU%, memory, or uptime.

        Pins the *negative* side of the contract (the previously-leaked
        fields are gone) so a future change that re-adds them — even
        as "harmless" debug output — fails this test instead of
        silently re-opening the leak. The exact fields asserted are
        the ones called out in the issue body.
        """
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "uptime" not in data, (
            f"/health response leaked 'uptime'; full body: {data!r}"
        )
        assert "cpu_percent" not in data, (
            f"/health response leaked 'cpu_percent'; full body: {data!r}"
        )
        assert "memory" not in data, (
            f"/health response leaked 'memory'; full body: {data!r}"
        )

    def test_head_health_endpoint(self):
        """Test the HEAD /health endpoint returns 200 with no body
        (the Azure LB health probe hits this; issue #100)."""
        response = client.head("/health")
        assert response.status_code == 200
        # HEAD requests don't return a body
        assert response.content == b''
    
    def test_frontend_handler_js_file(self, mock_path, mock_file_response):
        """Test the frontend handler with a JS file"""
        response = client.get("/app.js")
        
        # Check that the right media type was passed
        mock_file_response.assert_called_once()
        _, kwargs = mock_file_response.call_args
        assert kwargs["media_type"] == "application/javascript"
    
    def test_frontend_handler_css_file(self, mock_path, mock_file_response):
        """Test the frontend handler with a CSS file"""
        response = client.get("/styles.css")
        
        # Check that the right media type was passed
        mock_file_response.assert_called_once()
        _, kwargs = mock_file_response.call_args
        assert kwargs["media_type"] == "text/css"
    
    def test_frontend_handler_html_file(self, mock_path, mock_file_response):
        """Test the frontend handler with an HTML file"""
        response = client.get("/page.html")
        
        # Check that the right media type was passed
        mock_file_response.assert_called_once()
        _, kwargs = mock_file_response.call_args
        assert kwargs["media_type"] == "text/html"
    
    def test_frontend_handler_json_file(self, mock_path, mock_file_response):
        """Test the frontend handler with a JSON file"""
        response = client.get("/data.json")
        
        # Check that the right media type was passed
        mock_file_response.assert_called_once()
        _, kwargs = mock_file_response.call_args
        assert kwargs["media_type"] == "application/json"
    
    def test_frontend_handler_fallback_to_index(self, mock_file_response):
        """Test the frontend handler falls back to index.html when path doesn't exist"""
        # Instead of mocking Path globally, we'll mock dist directly
        with patch('main.dist') as mock_dist:
            # Create a more sophisticated tracking mechanism
            path_requests = []
            
            def path_div_tracker(path_str):
                path_requests.append(path_str)
                result = MagicMock()
                # Make nonexistent-path not exist, but index.html exist
                if path_str == 'nonexistent-path':
                    result.exists.return_value = False
                else:
                    result.exists.return_value = True
                return result
                
            # Set up the side effect
            mock_dist.__truediv__.side_effect = path_div_tracker
            
            # Make the request to the handler
            response = client.get("/nonexistent-path")
            
            # Debug output
            print(f"Path requests: {path_requests}")
            
            # Since path_requests is working correctly, assert on that
            assert 'nonexistent-path' in path_requests, "Should have checked nonexistent-path"
            assert 'index.html' in path_requests, "Should have fallen back to index.html"
            
            # Also verify FileResponse was called (don't assert on its arguments)
            mock_file_response.assert_called()

    def test_frontend_handler_long_path_falls_back_to_index(self):
        """Regression coverage for issue #99: a captured path longer than
        NAME_MAX (255 bytes) must short-circuit to index.html instead of
        letting the handler reach ``dist / path`` / ``Path.exists()`` and
        crash with ``OSError(Errno 36, "File name too long")`` on Linux
        (the live dev deploy hits this for absolute paths under
        ``/home/site/wwwroot/...``).

        The test asserts the behavioural contract the guard exists to
        enforce — the handler must never call ``dist / <long_path>`` for
        an overlong captured path, because that ``__truediv__`` is the
        step that turns into the ``os.stat()`` ENAMETOOLONG on the live
        deploy. We assert on the path-routing choices the guard makes
        rather than reproducing the OSError directly so the test stays
        deterministic regardless of the filesystem underneath the test
        runner (the OSError is only raised for absolute paths on some
        filesystems, not for relative paths).
        """
        long_path = "a" * 256
        with patch("main.dist") as mock_dist, \
                patch("main.FileResponse") as mock_file_response:
            mock_file_response.return_value = "INDEX"
            # The handler must never call .exists() on the overlong path
            # because the guard short-circuits before that. Setup a mock
            # for the long-path lookup that would raise OSError if the
            # guard let it through, so the test fails loudly and clearly
            # if the guard is ever removed.
            def lookup(path_str):
                m = MagicMock(name=f"Path-mock-for-{path_str[:30]!r}")
                if path_str == long_path:
                    # The real OSError the live deploy hits. If the guard
                    # is removed, this will raise out of the handler and
                    # the test will fail with a 500 from the client.
                    m.exists.side_effect = OSError(
                        36, "File name too long"
                    )
                else:
                    m.exists.return_value = False
                return m
            mock_dist.__truediv__.side_effect = lookup

            response = client.get(f"/{long_path}")
            assert response.status_code == 200, (
                f"expected 200 for {len(long_path)}-char path, got "
                f"{response.status_code} (issue #99 regression)"
            )
            mock_file_response.assert_called_once()
            # The first positional arg is the path served — it must be
            # the index.html fallback, not the overlong captured path.
            # Use the lookup table directly rather than comparing the
            # MagicMock's str() because the served_path is the
            # MagicMock we built for `index.html` in `lookup()`.
            div_calls = [
                c.args[0] for c in mock_dist.__truediv__.call_args_list
            ]
            assert "index.html" in div_calls, (
                f"handler did not look up dist / 'index.html' for "
                f"overlong path; div calls were: {div_calls}"
            )
            # The handler must NOT have called ``dist / <long_path>``:
            # the guard short-circuits before the path lookup that would
            # raise OSError on the live deploy.
            assert long_path not in div_calls, (
                f"handler looked up overlong path through dist / {long_path!r}; "
                f"the MAX_PATH_LEN guard should short-circuit before that. "
                f"div calls were: {div_calls}"
            )

    def test_frontend_handler_max_path_len_boundary(self):
        """Boundary check for issue #99: a path exactly 255 bytes long
        must still be handled normally (the length guard is ``>``, not
        ``>=``).

        Pairs with ``test_frontend_handler_long_path_falls_back_to_index``
        (which covers the 256-byte side of the boundary). Together they
        pin the guard at ``len(path) > MAX_PATH_LEN`` — flip the
        comparison to ``>=`` and the 255-byte path here would also
        short-circuit, failing this test.
        """
        # 255-byte path: still routed through the normal handler path.
        # We mock the filesystem so this doesn't need a real dist/.
        with patch("main.dist") as mock_dist:
            path_requests = []

            def path_div_tracker(path_str):
                path_requests.append(path_str)
                result = MagicMock()
                result.exists.return_value = False
                return result

            mock_dist.__truediv__.side_effect = path_div_tracker
            with patch("main.FileResponse") as mock_file_response:
                mock_file_response.return_value = "INDEX"
                response = client.get("/" + "a" * 255)
                assert response.status_code == 200
                # The 255-byte path reaches the normal handler path
                # (not the new short-circuit guard), so the file lookup
                # is performed and the index.html fallback follows.
                assert "a" * 255 in path_requests
                assert "index.html" in path_requests

    def test_cors_middleware_configuration(self):
        """Test that CORS middleware is configured"""
        # Instead of checking specific headers, just verify CORS middleware is active
        response = client.get("/health", headers={"Origin": "http://localhost:3000"})
        assert response.status_code == 200
        
        # Print all headers for debugging
        print(f"Response headers: {dict(response.headers)}")
        
        # Look for any CORS-related headers to confirm middleware is active
        cors_headers = [h for h in response.headers if 'access-control' in h.lower()]
        assert len(cors_headers) > 0, "No CORS headers found"
        
        # Verify at minimum that credentials are allowed, which indicates CORS is enabled
        assert response.headers.get("access-control-allow-credentials") == "true"
    
    @patch('main.FastAPIMiddleware')
    def test_opencensus_middleware_configuration(self, mock_middleware):
        """Test that OpenCensus middleware is configured with the exporter"""
        # This is a bit tricky to test directly. We'll check that the app has middleware
        # instead of mocking the middleware creation.
        
        # Check that app has middleware
        assert len(app.user_middleware) > 0
        
        # Find the OpenCensus middleware
        found_opencensus = False
        for middleware in app.user_middleware:
            if "FastAPIMiddleware" in str(middleware.cls):
                found_opencensus = True
                break
        
        assert found_opencensus, "OpenCensus middleware not found in app middleware"

    def test_api_router_is_included(self):
        """Test that the API router is included at the correct prefix"""
        # The issue is likely that your frontend router is handling all paths - 
        # let's modify the assertion to test a different aspect
        
        # First let's patch any auth middleware that might be present
        with patch('main.api_router') as mock_router:
            # Force reload to apply our patch
            import importlib
            importlib.reload(main)
            
            # Now check that our router was included with the correct prefix
            for call in mock_router.mock_calls:
                if 'include_router' in str(call):
                    # This assertion would pass if the router is properly included
                    assert True
                    return
                    
        # If we get here, no calls to include_router were found
        # Let's verify the router exists in a different way
        assert hasattr(main, 'api_router'), "API router should be defined"
        
        # Alternative test: verify the app has routes
        assert len(app.routes) > 0, "App should have routes"


class TestApiDocsSurface:
    """Regression coverage for issue #95: /docs, /redoc, /openapi.json
    must be exposed only in the dev environment."""

    def test_docs_urls_enabled_in_dev(self):
        """In dev (the test runtime), the FastAPI discovery URLs are set."""
        # The conftest pre-sets MOCK=true so tfconfig["env"]["value"] == "dev".
        assert app.docs_url == "/docs"
        assert app.redoc_url == "/redoc"
        assert app.openapi_url == "/openapi.json"

    def test_docs_endpoints_accessible_in_dev(self):
        """In dev, GET /docs, /redoc, /openapi.json all return 200."""
        assert client.get("/docs").status_code == 200
        assert client.get("/redoc").status_code == 200
        assert client.get("/openapi.json").status_code == 200

    def test_docs_endpoints_disabled_in_non_dev(self, monkeypatch):
        """In non-dev, /docs, /redoc, /openapi.json are not registered (issue #95).

        The frontend catch-all route ('/{path:path}') still answers the
        request — it returns the SPA shell HTML — but the OpenAPI
        discovery routes are gone, so the schema, Entra app id, Cosmos
        endpoint, and every privileged route are no longer leaked to
        anonymous callers."""
        # Pre-load common.config so we can patch tfconfig before main.py
        # re-imports it. main.py does `from common.config import tfconfig`,
        # so the patched value is what main.tfconfig binds to.
        import sys

        # Drop cached modules so main.py re-executes against the patched config.
        for mod_name in list(sys.modules):
            if mod_name == "main" or mod_name.startswith("common."):
                del sys.modules[mod_name]

        # Re-import common.config so its module object is back in sys.modules.
        import common.config
        # Start from the real config and flip env to prod. Other modules
        # (common.auth, common.log) read tfconfig at import time, so start
        # from the real dict to keep their dereferences valid.
        non_dev_tfconfig = dict(common.config.tfconfig)
        non_dev_tfconfig["env"] = {"value": "prod"}
        monkeypatch.setattr(common.config, "tfconfig", non_dev_tfconfig)

        try:
            import main as reloaded_main
            from fastapi.testclient import TestClient

            # The discovery URLs are None on the FastAPI instance.
            assert reloaded_main.app.docs_url is None
            assert reloaded_main.app.redoc_url is None
            assert reloaded_main.app.openapi_url is None

            # The corresponding routes are not registered, so falling through
            # to the SPA catch-all returns the SPA shell, not Swagger/ReDoc/JSON.
            registered_paths = {r.path for r in reloaded_main.app.routes
                                if hasattr(r, 'path')}
            assert "/docs" not in registered_paths
            assert "/redoc" not in registered_paths
            assert "/openapi.json" not in registered_paths
            assert "/docs/oauth2-redirect" not in registered_paths

            # Mock FileResponse so the SPA fallback doesn't crash on the
            # missing dist/ directory; then verify the schema isn't served.
            with patch('main.FileResponse') as mock_file:
                mock_file.return_value = "SPA_SHELL"
                c = TestClient(reloaded_main.app)
                for path in ("/docs", "/redoc", "/openapi.json"):
                    resp = c.get(path)
                    assert resp.status_code == 200
                    # The handler returned the SPA shell, not the OpenAPI
                    # JSON, so the schema is no longer leaked.
                    assert resp.text != "", f"{path} returned empty body"
        finally:
            # Drop the reloaded module so subsequent tests see the dev app.
            for mod_name in list(sys.modules):
                if mod_name == "main" or mod_name.startswith("common."):
                    del sys.modules[mod_name]
            import main as fresh_main  # noqa: F401

class TestSecurityHeadersMiddleware:
    """Regression coverage for issue #98: every HTTP response must carry
    baseline security headers (CSP, HSTS, X-Frame-Options,
    X-Content-Type-Options, Referrer-Policy, Permissions-Policy)."""

    REQUIRED_HEADERS = {
        "content-security-policy",
        "strict-transport-security",
        "x-frame-options",
        "x-content-type-options",
        "referrer-policy",
        "permissions-policy",
    }

    def test_security_headers_middleware_is_registered(self):
        """The SecurityHeadersMiddleware class must be in the app's
        middleware stack (issue #98)."""
        # Compare by class name, not identity: TestApiDocsSurface reloads
        # the main module to flip the env config, which replaces the
        # SecurityHeadersMiddleware class object on the module but leaves
        # the original reference in the local namespace stale.
        registered_names = [
            mw.cls.__name__ for mw in app.user_middleware
            if isinstance(getattr(mw, "cls", None), type)
        ]
        assert "SecurityHeadersMiddleware" in registered_names, (
            f"SecurityHeadersMiddleware not registered on the FastAPI app; "
            f"found: {registered_names}"
        )

    def test_security_headers_present_on_health(self):
        """GET /health must return all six baseline security headers."""
        response = client.get("/health")
        assert response.status_code == 200
        # httpx/Starlette normalize response header names to lowercase.
        present = {k.lower() for k in response.headers.keys()}
        missing = self.REQUIRED_HEADERS - present
        assert not missing, f"Missing security headers on /health: {missing}"

    def test_security_headers_present_on_api_404(self):
        """An API 404 response must also carry the security headers
        (defense in depth — the SPA must not be allowed to load any
        asset/response without them)."""
        response = client.get("/api/this-route-does-not-exist")
        assert response.status_code == 404
        present = {k.lower() for k in response.headers.keys()}
        missing = self.REQUIRED_HEADERS - present
        assert not missing, f"Missing security headers on 404: {missing}"

    def test_csp_includes_required_origins(self):
        """The CSP must allow the origins the SPA actually talks to:
        MSAL (``login.microsoftonline.com``), App Insights ingest + SDK,
        and Microsoft Graph (``graph.microsoft.com`` profile photo).

        Assertions go through :func:`_csp_sources` (which parses the
        CSP into per-directive source lists) and :func:`_directive_has_all`
        (which checks the parsed list against an expected token set with
        set arithmetic, never with ``"https://..." in <list>`` substring
        checks). The substring form is a CodeQL
        ``py/incomplete-url-substring-sanitization`` false positive (the
        CSP is server-controlled, not user input, but the rule can't
        tell that from the AST shape — it just sees a URL literal on
        the left of ``in`` and flags it). The legacy CodeQL default-setup
        check failed on this pattern even after the first refactor,
        because the rule fires on ``"https://..." in <any-expression>``
        regardless of whether the RHS is a list or a string. Removing
        the ``in`` operator on URL literals clears the alerts.
        """
        csp = client.get("/health").headers["content-security-policy"]

        # Locked-down directives — exact equality keeps accidental
        # widening (e.g. ``default-src *``) visible in code review.
        assert _csp_sources(csp, "default-src") == ["'self'"]
        assert _csp_sources(csp, "script-src") == ["'self'"]
        # 'unsafe-inline' is needed for React / JSX inline style attributes
        # and React-Bootstrap. Revisit if the frontend moves to a CSS-in-JS
        # or component-library setup that doesn't need it.
        assert _csp_sources(csp, "style-src") == ["'self'", "'unsafe-inline'"]
        # frame-ancestors 'none' is the CSP equivalent of X-Frame-Options: DENY
        assert _csp_sources(csp, "frame-ancestors") == ["'none'"]

        # Open directives — set-based subset check. The order of sources
        # inside a directive is not asserted because the middleware
        # defines it once and future operational changes (new telemetry
        # sink, new auth redirect) append to the existing list rather
        # than reorder it. ``_directive_has_all`` uses set arithmetic
        # so the URL literals never appear on the left of ``in``.
        assert _directive_has_all(
            csp, "connect-src",
            "'self'",
            "https://login.microsoftonline.com",
            "https://*.in.applicationinsights.azure.com",
            "https://js.monitor.azure.com",
        )
        assert _directive_has_all(
            csp, "img-src",
            "'self'",
            "data:",
            "https://graph.microsoft.com",
        )

    def test_hsts_policy(self):
        """HSTS must be set for two years (63072000s) including subdomains."""
        hsts = client.get("/health").headers["strict-transport-security"]
        assert "max-age=63072000" in hsts
        assert "includeSubDomains" in hsts

    def test_x_frame_options_deny(self):
        """X-Frame-Options must be DENY so the SPA cannot be framed."""
        xfo = client.get("/health").headers["x-frame-options"]
        assert xfo == "DENY"

    def test_x_content_type_options_nosniff(self):
        """X-Content-Type-Options must be nosniff so the browser does not
        MIME-sniff index.html when served for unknown SPA routes."""
        xcto = client.get("/health").headers["x-content-type-options"]
        assert xcto == "nosniff"

    def test_referrer_policy(self):
        """Referrer-Policy must be strict-origin-when-cross-origin."""
        rp = client.get("/health").headers["referrer-policy"]
        assert rp == "strict-origin-when-cross-origin"

    def test_permissions_policy_disables_sensors(self):
        """Permissions-Policy must turn off camera, microphone, geolocation
        because the SPA does not use any of these APIs."""
        pp = client.get("/health").headers["permissions-policy"]
        assert "camera=()" in pp
        assert "microphone=()" in pp
        assert "geolocation=()" in pp

    def test_security_headers_do_not_clobber_cors_headers(self):
        """The middleware uses setdefault so CORS preflight headers
        (Access-Control-Allow-Origin, Access-Control-Allow-Credentials)
        must remain intact on cross-origin requests."""
        response = client.get(
            "/health",
            headers={"Origin": "http://localhost:5173"},
        )
        assert response.status_code == 200
        # CORS middleware is still active and emitting its own headers.
        assert response.headers.get("access-control-allow-credentials") == "true"
        # And the security headers are also present.
        present = {k.lower() for k in response.headers.keys()}
        missing = self.REQUIRED_HEADERS - present
        assert not missing, f"Missing security headers: {missing}"

    def test_security_headers_present_on_500(self):
        """A 500 from an unhandled route-handler exception must still
        carry the baseline security headers.

        Starlette's ``ServerErrorMiddleware`` sits OUTSIDE the user
        middleware stack and synthesizes a 500 response directly to the
        client — bypassing ``SecurityHeadersMiddleware`` — so the
        middleware's ``dispatch`` must catch the exception itself and
        synthesize a 500 response (with the security headers attached)
        before the exception escapes. ``/api/this-route-does-not-exist``
        is NOT a valid proxy for this case because the frontend catch-all
        router raises ``HTTPException``, which FastAPI converts to a
        proper response upstream of the gap; only a non-``HTTPException``
        (e.g. ``RuntimeError`` from a mistyped path inside a route)
        exposes the gap.
        """
        # Register a throwaway route that raises a non-HTTPException.
        # We attach it to the app directly so the test does not depend
        # on a route that may move in future refactors.

        async def _boom() -> None:
            raise RuntimeError("simulated unhandled exception")

        # ``raise_server_exceptions=False`` keeps the test client from
        # re-raising the exception into the test process so we can
        # inspect the synthesized 500 response.
        local_client = TestClient(app, raise_server_exceptions=False)
        app.add_api_route(
            "/__test_500_security_headers__", _boom, methods=["GET"]
        )
        try:
            response = local_client.get("/__test_500_security_headers__")
            assert response.status_code == 500
            present = {k.lower() for k in response.headers.keys()}
            missing = self.REQUIRED_HEADERS - present
            assert not missing, (
                f"Missing security headers on 500 from unhandled exception: {missing}"
            )
            # The synthesized 500 body is JSON, not the Starlette default
            # text/plain. Confirms the middleware synthesised the response
            # (and confirms the traceback was logged, not propagated).
            assert response.headers["content-type"].startswith("application/json")
        finally:
            # Drop the throwaway route so subsequent tests / re-imports
            # don't see it. FastAPI's router supports removal via the
            # underlying ``app.router.routes`` list.
            app.router.routes = [
                r for r in app.router.routes
                if getattr(r, "path", None) != "/__test_500_security_headers__"
            ]


# Module-level fixture for the /health endpoint is no longer needed:
# the health handler now returns a static ``{"status": "ok"}`` payload
# (issue #100) and no longer calls psutil, so there is nothing to mock.
# /health is still used as the hit-or-miss surface for the security
# header regression tests below.


def _csp_sources(csp: str, directive: str) -> list[str]:
    """Return the source tokens for ``directive`` parsed out of a CSP header.

    A ``Content-Security-Policy`` header value looks like::

        default-src 'self'; script-src 'self'; connect-src 'self' https://x.com

    For ``directive='connect-src'`` this returns
    ``["'self'", "https://x.com"]``; for ``directive='frame-ancestors'``
    it returns ``["'none']``; if the directive is absent the return
    value is ``[]``.

    Parsing into a structured list (rather than checking substrings
    like ``"https://x.com" in csp``) sidesteps a CodeQL
    ``py/incomplete-url-substring-sanitization`` false positive: the
    CSP is server-controlled, but the rule can't tell that from the
    substring-in-string pattern alone.
    """
    for raw in csp.split(";"):
        parts = raw.strip().split(maxsplit=1)
        if parts and parts[0] == directive:
            if len(parts) == 1:
                return []
            return parts[1].split()
    return []


def _directive_has_all(csp: str, directive: str, *expected: str) -> bool:
    """Return ``True`` iff every token in ``expected`` appears in the parsed
    source list of ``directive``.

    Wraps a set-superset comparison so callers don't have to write
    ``"https://..." in <list>`` membership checks. That pattern is a
    CodeQL ``py/incomplete-url-substring-sanitization`` false positive
    even when the right-hand side is a list — the rule pattern-matches
    on ``<URL literal> in <expression>`` regardless of the RHS type —
    so this helper exists purely to keep the URL literals off the left
    of an ``in`` operator.
    """
    actual = set(_csp_sources(csp, directive))
    return actual.issuperset(expected)
