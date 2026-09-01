import asyncio
import importlib
from unittest.mock import patch

import pytest

import main  # noqa: F401  (ensures the module is importable at collection time)


def _live_main():
    """The ``main`` module object currently in ``sys.modules``.

    ``TestApiDocsSurface`` in main_test.py deletes and re-imports ``main`` to
    exercise the non-dev app, so the module-level ``import main`` above can be
    left pointing at a stale object while ``patch("main.dist", ...)`` patches
    the fresh one. Resolving the module at call time keeps the patch and the
    handler under test on the same object. Before issue #151 that mismatch was
    invisible: the handler ran against the unpatched ``./dist``, found no file,
    and answered with the SPA shell — which still carried the asset's
    Content-Type from the media-type ladder, so the assertion passed for the
    wrong reason.
    """
    return importlib.import_module("main")


@pytest.mark.parametrize(
    ("filename", "expected_content_type"),
    [
        ("logo.svg", "image/svg+xml"),
        ("font.woff2", "font/woff2"),
        ("favicon.ico", "image/vnd.microsoft.icon"),
        ("logo.png", "image/png"),
        ("app.js.map", "application/json"),
    ],
)
def test_frontend_handler_asset_content_types(
    tmp_path, filename, expected_content_type
):
    """Vite asset extensions receive their expected MIME types."""
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    (dist_dir / filename).write_text("asset")

    live_main = _live_main()
    with patch.object(live_main, "dist", dist_dir):
        response = asyncio.run(live_main.frontend_handler(filename))

    assert response.status_code == 200
    assert response.headers["content-type"] == expected_content_type
