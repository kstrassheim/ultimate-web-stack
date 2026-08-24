import asyncio
from unittest.mock import patch

import pytest

import main


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

    with patch("main.dist", dist_dir):
        response = asyncio.run(main.frontend_handler(filename))

    assert response.status_code == 200
    assert response.headers["content-type"] == expected_content_type
