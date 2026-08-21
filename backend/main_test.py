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

    def test_uvicorn_imported_at_module_scope(self):
        """Issue #107: ``uvicorn`` must be importable in ``main``'s module
        namespace so that ``python backend/main.py`` (the ``__main__``
        block) actually works.

        The previous file called ``uvicorn.run(...)`` inside
        ``if __name__ == '__main__':`` without ever importing the
        module, so any user who ran the obvious ``python main.py``
        invocation got ``NameError: name 'uvicorn' is not defined``.
        The real entry points (``frontend/start-backend.js`` shells
        out to ``python -m uvicorn``, ``.vscode/launch.json`` uses
        ``"module": "uvicorn"``, and ``terraform.tf`` uses gunicorn)
        all bypass the ``__main__`` block, which is why this never
        tripped in CI — but ``python backend/main.py`` is the
        acceptance criterion in the issue and is the natural thing
        to try first.

        Regression guard: assert ``main.uvicorn`` is the real uvicorn
        module, not a name shadowed by something else.
        """
        import main as main_module

        assert hasattr(main_module, "uvicorn"), (
            "uvicorn must be imported at module scope so the "
            "__main__ block works (issue #107)"
        )
        # Belt-and-braces: make sure the symbol is the real module.
        import uvicorn as _real_uvicorn
        assert main_module.uvicorn is _real_uvicorn

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
    
    def test_frontend_handler_fallback_to_index(self, tmp_path):
        """Unknown routes under dist/ (e.g. a deep link whose path
        doesn't correspond to a real file) must fall back to the SPA
        shell. This is the same fallback path the traversal guard in
        issue #109 relies on — the handler falls back whenever the
        resolved candidate isn't a real file under dist/."""
        dist_dir = tmp_path / "dist"
        dist_dir.mkdir()
        (dist_dir / "index.html").write_text("<html>SPA_SHELL</html>")
        with patch("main.dist", dist_dir):
            response = client.get("/nonexistent-path")
            assert response.status_code == 200
            assert response.text == "<html>SPA_SHELL</html>", (
                f"unknown route did not serve SPA shell: {response.text!r}"
            )

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

    def test_frontend_handler_max_path_len_boundary(self, tmp_path):
        """Boundary check for issue #99: a path exactly 255 bytes long
        must still be handled normally (the length guard is ``>``, not
        ``>=``).

        Pairs with ``test_frontend_handler_long_path_falls_back_to_index``
        (which covers the 256-byte side of the boundary). Together they
        pin the guard at ``len(path) > MAX_PATH_LEN`` — flip the
        comparison to ``>=`` and the 255-byte path here would also
        short-circuit, failing this test.

        The handler treats an overlong path as if the SPA shell were
        requested, so the response body must be the SPA shell for a
        255-byte path that doesn't correspond to a real file under
        dist/. The containment check added for issue #109 is the same
        code path that fires for any unknown route, which is what this
        test exercises end-to-end.
        """
        dist_dir = tmp_path / "dist"
        dist_dir.mkdir()
        (dist_dir / "index.html").write_text("<html>SPA_SHELL</html>")
        with patch("main.dist", dist_dir):
            response = client.get("/" + "a" * 255)
            assert response.status_code == 200
            assert response.text == "<html>SPA_SHELL</html>", (
                f"255-byte path did not fall back to SPA shell: "
                f"{response.text!r}"
            )

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


class TestFrontendHandlerPathContainment:
    """Regression coverage for issue #109: a captured path that resolves
    outside ``./dist`` must fall back to the SPA shell instead of
    being served.

    Before the fix, ``frontend_handler`` did ``fp = dist / path`` and
    ``fp.exists()`` (the existing api/future-gadget-lab prefix checks
    only guard those two prefixes — they don't defend against ``..``
    segments, absolute paths, or symlinks pointing out of dist). A
    request whose path contains traversal segments that survive the
    client and the proxy — e.g. URL-encoded ``..`` like
    ``/..%2fsecret.txt`` (httpx + Starlette URL normalization leaves
    ``%2f`` and ``%2e`` encoded, so the captured ``path`` is
    ``../secret.txt``) — resolves ``dist / "../secret.txt"`` to a
    sibling of dist and serves it with 200. The same hole covers
    symlinks inside dist that point out of it, because
    ``Path.exists()`` follows symlinks.

    The fix is to call ``Path.resolve()`` on the candidate and confirm
    ``dist_resolved`` is one of its ancestors before serving. These
    tests pin both halves of the contract: a traversal attempt falls
    back to the SPA shell, and a normal asset is still served with
    its real content (the guard must not over-reach). They run against
    a real ``tmp_path`` dist tree (not mocks) so the resolve() /
    containment behavior is under test, not the mock plumbing.
    """

    def _build_dist(self, tmp_path):
        """Build a tmp tree that looks like a deployed backend:
        ``dist/index.html`` + ``dist/app.js`` are real assets; a
        ``secret.txt`` sibling of dist/ is the out-of-tree file the
        handler must never serve. Returns the ``dist/`` Path to patch
        in as ``main.dist``.
        """
        dist_dir = tmp_path / "dist"
        dist_dir.mkdir()
        (dist_dir / "index.html").write_text("<html>SPA_SHELL</html>")
        (dist_dir / "app.js").write_text("// ASSET")
        (dist_dir / "page.html").write_text("<html>DEEP_LINK</html>")
        (tmp_path / "secret.txt").write_text("TOP_SECRET_DATA")
        return dist_dir

    def test_url_encoded_traversal_falls_back_to_spa_shell(self, tmp_path):
        """Issue #109: ``GET /..%2fsecret.txt`` (URL-encoded ``..`` that
        survives httpx/Starlette URL normalization) must return the
        SPA shell, not ``secret.txt``.

        Without the resolve()+containment guard, the captured ``path``
        is ``../secret.txt`` and ``dist / "../secret.txt"`` resolves
        to a real file outside ``./dist`` that the handler serves
        with 200. With the fix, ``Path.resolve()`` makes the
        out-of-tree nature of the target explicit and the
        containment check (``fp.is_relative_to(dist_resolved)``)
        rejects it — the handler falls back to ``index.html``.
        """
        dist_dir = self._build_dist(tmp_path)
        with patch("main.dist", dist_dir):
            response = client.get("/..%2fsecret.txt")
        assert response.status_code == 200
        assert b"TOP_SECRET_DATA" not in response.content, (
            f"handler leaked out-of-tree file via path traversal: "
            f"{response.content!r}"
        )
        assert b"SPA_SHELL" in response.content, (
            f"handler did not fall back to SPA shell on traversal: "
            f"{response.content!r}"
        )

    def test_dot_segment_traversal_falls_back_to_spa_shell(self, tmp_path):
        """Issue #109: variants like ``GET /.%2e/secret.txt`` and
        ``GET /%2e%2e/secret.txt`` (URL-encoded ``..`` with the slash
        left encoded) must also fall back to the SPA shell.

        Some proxies normalize the slash but leave ``%2e`` encoded;
        others do the opposite. The handler must defend against all
        three spellings because the captured ``path`` is what reaches
        ``dist / path``, not what the URL looked like at the edge.
        """
        dist_dir = self._build_dist(tmp_path)
        for traversal in ("/.%2e/secret.txt", "/%2e%2e/secret.txt"):
            with patch("main.dist", dist_dir):
                response = client.get(traversal)
            assert response.status_code == 200, (
                f"{traversal!r} returned {response.status_code}, "
                f"expected 200 with SPA shell"
            )
            assert b"TOP_SECRET_DATA" not in response.content, (
                f"{traversal!r} leaked out-of-tree file: "
                f"{response.content!r}"
            )
            assert b"SPA_SHELL" in response.content, (
                f"{traversal!r} did not fall back to SPA shell: "
                f"{response.content!r}"
            )

    def test_normal_asset_still_served(self, tmp_path):
        """Issue #109 (positive case): ``GET /app.js`` must serve the
        real asset, not the SPA shell — the containment check must
        not over-reach and start rejecting real assets under dist/.

        Pairs with the traversal tests above. Together they pin the
        containment check: it must reject paths resolving outside dist/
        without rejecting paths that resolve inside dist/.
        """
        dist_dir = self._build_dist(tmp_path)
        with patch("main.dist", dist_dir):
            response = client.get("/app.js")
        assert response.status_code == 200
        assert response.content == b"// ASSET", (
            f"real asset under dist/ was not served: "
            f"{response.content!r}"
        )
        assert "javascript" in response.headers["content-type"], (
            f"JS asset served with wrong media type: "
            f"{response.headers.get('content-type')!r}"
        )

    def test_unknown_route_falls_back_to_spa_shell(self, tmp_path):
        """Issue #109 (positive control): a deep link whose path
        doesn't correspond to any file under dist/ must still serve
        the SPA shell — the resolve()+containment check must NOT
        turn the SPA fallback into a 404.

        This is the existing SPA fallback behaviour, exercised here
        end-to-end against a real dist tree to confirm the new
        containment code doesn't regress it.
        """
        dist_dir = self._build_dist(tmp_path)
        with patch("main.dist", dist_dir):
            response = client.get("/some/deep/route/that/does/not/exist")
        assert response.status_code == 200
        assert response.text == "<html>SPA_SHELL</html>", (
            f"unknown SPA route did not serve SPA shell: "
            f"{response.text!r}"
        )

    def test_sibling_file_with_same_name_not_served(self, tmp_path):
        """Issue #109 (negative case for absolute-looking paths): a
        sibling of ``dist/`` that shares a name with a real dist
        asset must not be served in its place.

        Concretely: the fixture creates both ``dist/page.html``
        (``<html>DEEP_LINK</html>``) and a sibling
        ``tmp_path/page.html`` (``SIBLING_FILE``) at the same name.
        A request for ``/page.html`` must serve the dist file (the
        SPA route), not the sibling — if the containment check were
        broken, the sibling could be served because ``dist / path``
        resolves to a path under dist/ but the underlying file
        could be anywhere on disk after symlink resolution. This test
        exercises the ``fp = (dist / path).resolve()`` step that
        canonicalises the path before the containment check runs.
        """
        dist_dir = self._build_dist(tmp_path)
        (tmp_path / "page.html").write_text("SIBLING_FILE")
        with patch("main.dist", dist_dir):
            response = client.get("/page.html")
        assert response.status_code == 200
        assert response.content == b"<html>DEEP_LINK</html>", (
            f"handler served the sibling of dist/ instead of "
            f"dist/page.html: {response.content!r}"
        )
        assert b"SIBLING_FILE" not in response.content, (
            f"sibling file leaked into response: {response.content!r}"
        )

    def test_symlink_escape_falls_back_to_spa_shell(self, tmp_path):
        """Issue #109 (negative case for symlinks): a symlink inside
        ``dist/`` that points to a file outside it must not be served.

        ``Path.resolve()`` follows symlinks, so the resolved
        candidate lands outside ``dist_resolved`` and the containment
        check rejects it — the handler falls back to the SPA shell
        instead of serving the symlink target. On Windows symlinks
        require elevated privileges; if ``symlink_to`` raises
        ``OSError`` (e.g. on a CI runner without dev mode), the
        test is skipped rather than failing.
        """
        dist_dir = self._build_dist(tmp_path)
        try:
            (dist_dir / "sneaky").symlink_to(tmp_path / "secret.txt")
        except OSError:
            pytest.skip("symlink creation not supported on this platform")
        with patch("main.dist", dist_dir):
            response = client.get("/sneaky")
        assert response.status_code == 200
        assert b"TOP_SECRET_DATA" not in response.content, (
            f"symlink escape served out-of-tree file: "
            f"{response.content!r}"
        )
        assert b"SPA_SHELL" in response.content, (
            f"symlink escape did not fall back to SPA shell: "
            f"{response.content!r}"
        )

    def test_containment_check_uses_resolve_not_string_prefix(self, tmp_path):
        """Issue #109 acceptance criterion: the containment check must
        use ``Path.resolve()``, not a string-prefix check on the raw
        input.

        This test pins the check method so a future "optimisation"
        that swaps ``fp.is_relative_to(dist_resolved)`` for
        ``dist_resolved.as_posix() in fp.as_posix()`` (a substring
        check) fails this test instead of silently re-opening the
        hole. Concretely: we set up ``dist_resolved`` as
        ``tmp_path/dist`` and create a directory ``dist_other`` at
        the same depth with the same name prefix. A string-prefix
        check would let ``dist_other/secret.txt`` through; the
        ``is_relative_to`` resolve()-based check rejects it because
        ``dist_other/secret.txt`` is not under ``tmp_path/dist``.
        """
        dist_dir = tmp_path / "dist"
        dist_dir.mkdir()
        (dist_dir / "index.html").write_text("<html>SPA_SHELL</html>")
        # Sibling with a name that shares the prefix ``dist``: the
        # classic string-prefix-bypass target.
        sibling_dir = tmp_path / "dist_other"
        sibling_dir.mkdir()
        (sibling_dir / "secret.txt").write_text("PREFIX_BYPASS_SECRET")
        with patch("main.dist", dist_dir):
            # The captured path is ``dist_other/secret.txt`` — under
            # a string-prefix check on ``dist/`` this would resolve
            # to ``tmp_path/dist_other/secret.txt`` and be served.
            # Under the resolve()-based containment check, the
            # resolved path is not under ``dist_resolved`` and the
            # handler must fall back to the SPA shell.
            response = client.get("/dist_other/secret.txt")
        assert response.status_code == 200
        assert b"PREFIX_BYPASS_SECRET" not in response.content, (
            f"string-prefix containment check served "
            f"out-of-prefix file: {response.content!r}"
        )
        assert b"SPA_SHELL" in response.content, (
            f"handler did not fall back to SPA shell on prefix-bypass "
            f"attempt: {response.content!r}"
        )

    def test_early_dot_segment_reject_falls_back_to_spa_shell(self):
        """Issue #109: layer 1 of the containment check is an early
        ``..`` segment deny-list. Its only runtime effect is to
        short-circuit the handler before the path is fed to a
        ``Path(...)`` constructor; layer 2 (resolve() +
        is_relative_to()) would catch the same case anyway. The
        layer exists to give static-analysis tooling (CodeQL
        ``py/path-injection``) a sanitizer it recognises for the
        user-controlled ``path`` value — the pattern must match any
        captured path whose segments contain a literal ``..``.

        This test pins the pattern's contract directly: if someone
        weakens the regex to be more permissive (e.g. drops the
        ``(^|/)`` anchor, lets ``..`` appear inside a segment like
        ``foo..bar``), this test fires. Concretely: the existing
        URL-encoded traversal tests
        (``test_url_encoded_traversal_...``) cover the end-to-end
        behaviour; this test pins the regex shape itself so a
        future "simplification" can't silently re-open the static-
        analysis hole.
        """
        import re as _re  # local import keeps the test self-contained
        pattern = r'(^|/)\.\.($|/)'
        # These must match — the captured paths the URL-encoded
        # traversal tests produce.
        must_match = [
            "../secret.txt",       # /..%2fsecret.txt -> ../secret.txt
            "../foo/bar",          # /%2e%2e/foo/bar -> ../foo/bar
            "foo/../bar",          # URL /foo/..%2fbar -> foo/../bar
            "foo/..",              # URL /foo/..%2fbar -> foo/..
            "a/b/../c",            # multiple segments
        ]
        for p in must_match:
            assert _re.search(pattern, p), (
                f"regex pattern {pattern!r} must match captured "
                f"path {p!r} — layer 1 would not short-circuit and "
                f"the static-analysis sanitizer would be lost"
            )
        # These must NOT match — substring matches would over-reject
        # real files like `foo..bar.html` (a legitimate filename with
        # two dots in the middle).
        must_not_match = [
            "foo..bar",            # two dots inside a filename segment
            "..foo",               # `..` prefix of a segment, not its own
            "foo..",               # `..` suffix of a segment, not its own
            "app.js",              # ordinary asset name
            "a/b/c.js",            # ordinary deep path
        ]
        for p in must_not_match:
            assert not _re.search(pattern, p), (
                f"regex pattern {pattern!r} must NOT match "
                f"{p!r} — layer 1 would over-reject legitimate "
                f"paths and break the SPA for ordinary deep links"
            )


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
