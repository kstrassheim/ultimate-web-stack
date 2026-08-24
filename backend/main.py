from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from contextlib import asynccontextmanager
import os.path
import re
import uvicorn
# for Application Insights
from opencensus.ext.fastapi.fastapi_middleware import FastAPIMiddleware
from opencensus.trace.samplers import ProbabilitySampler
# Security headers middleware (issue #98): adds CSP, HSTS, X-Frame-Options,
# X-Content-Type-Options, Referrer-Policy, Permissions-Policy to every
# HTTP response. The F1 (free) App Service tier does not inject these
# by default, so the FastAPI app must emit them itself.
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

_logger = logging.getLogger(__name__)

# load environment variables
from os import environ as os_environ
from dotenv import load_dotenv
load_dotenv()
# Import config early so we can gate /docs, /redoc, /openapi.json
# in non-dev environments (see issue #95) at FastAPI construction time.
from common.config import tfconfig, origins

# Security headers applied to every HTTP response (issue #98).
#
# The CSP connect-src explicitly allows:
#   - https://login.microsoftonline.com (MSAL / Entra ID auth redirect)
#   - https://*.in.applicationinsights.azure.com (App Insights telemetry ingest)
#   - https://js.monitor.azure.com (App Insights SDK CDN snippets)
# The img-src allows https://graph.microsoft.com because the SPA fetches
# the signed-in user's profile photo from Microsoft Graph. Add any new
# external origin that the SPA or telemetry stack talks to here, otherwise
# the browser will block the request after deployment.
_SECURITY_HEADERS_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "connect-src 'self' https://login.microsoftonline.com "
    "https://*.in.applicationinsights.azure.com https://js.monitor.azure.com; "
    "img-src 'self' data: https://graph.microsoft.com; "
    "style-src 'self' 'unsafe-inline'; "
    "frame-ancestors 'none'"
)
_SECURITY_HEADERS_HSTS = "max-age=63072000; includeSubDomains"
_SECURITY_HEADERS_REFERRER = "strict-origin-when-cross-origin"
_SECURITY_HEADERS_PERMISSIONS = "camera=(), microphone=(), geolocation=()"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds baseline security response headers to every HTTP response.

    See issue #98. ``setdefault`` is used on every header so that
    downstream middleware (CORS, OpenCensus telemetry) can still emit
    their own headers without being clobbered by this layer.

    The dispatch body is wrapped in ``try/except`` so that unhandled
    exceptions raised by route handlers (or any inner middleware) still
    produce a 500 response with the baseline security headers attached.
    Starlette's ``ServerErrorMiddleware`` sits OUTSIDE the user
    middleware stack and synthesizes a 500 response directly to the
    client — bypassing this middleware — so without the explicit catch
    any uncaught exception would produce a 500 with no security
    headers. The exception is logged before the synthesized 500 is
    returned so the traceback still reaches application log
    aggregation (ServerErrorMiddleware would otherwise log it on its
    own path, but we never reach that path).
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request, call_next):
        try:
            resp: Response = await call_next(request)
        except Exception:
            _logger.exception(
                "Unhandled exception in request handler; returning 500 "
                "with baseline security headers"
            )
            resp = JSONResponse(
                {"detail": "Internal Server Error"},
                status_code=500,
            )
        resp.headers.setdefault("Content-Security-Policy", _SECURITY_HEADERS_CSP)
        resp.headers.setdefault("Strict-Transport-Security", _SECURITY_HEADERS_HSTS)
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", _SECURITY_HEADERS_REFERRER)
        resp.headers.setdefault("Permissions-Policy", _SECURITY_HEADERS_PERMISSIONS)
        return resp


# get routers
from api.api import api_router
from api.future_gadget_api import future_gadget_api_router
# Check MOCK environment variable
mock_enabled = os_environ.get("MOCK", "false").lower() == "true"

# ---------------------------------------------------------------------
# Future Gadget Lab test-data seeding (issue #112)
#
# Test data used to be generated as a side effect of importing this
# module:
#
#   if not fgl_service.get_all_experiments() and not fgl_service.get_all_divergence_readings():
#       test_data = generate_test_data(fgl_service)
#       print(...)
#
# That meant *every* import of ``backend.main`` (unit tests, tooling
# scripts, ``--reload`` picking the module back up) wrote to the data
# store, and under a multi-worker server every worker raced on the
# emptiness check. It also routed messages through ``print`` instead of
# the configured logger.
#
# Seeding now lives in the FastAPI ``lifespan`` startup hook below, so
# it runs exactly once per application start. Whether it runs at all is
# controlled by the ``SEED_FGL_TEST_DATA`` env var:
#
#   "true"   - always seed if the store is empty (handy for a first
#              deploy to a fresh Cosmos container).
#   "false"  - never seed.
#   "auto"   (default) - seed iff MOCK mode is enabled, matching the
#              pre-#112 dev behaviour where import-time seeding ran
#              only under MOCK=true.
#
# Importing ``backend.main`` performs NO writes now — the helper is
# only invoked from inside ``lifespan`` after the app starts serving.
# ---------------------------------------------------------------------
_SEED_FGL_TEST_DATA_ENV = "SEED_FGL_TEST_DATA"


def _should_seed_fgl_test_data() -> bool:
    """Decide whether the lifespan startup hook should seed FGL test data.

    See the module-level comment on ``_SEED_FGL_TEST_DATA_ENV`` for the
    full semantics. The env-var lookup is done here (not at module
    import time) so tests can flip the variable between cases without
    re-importing ``main``.
    """
    raw = os_environ.get(_SEED_FGL_TEST_DATA_ENV, "auto").strip().lower()
    if raw == "true":
        return True
    if raw == "false":
        return False
    return mock_enabled


# Init FastAPI - hide API discovery surface (/docs, /redoc, /openapi.json)
# in non-dev environments so the schema, Entra app id, Cosmos endpoint,
# and every privileged route are not exposed to anonymous callers (#95).
is_dev = tfconfig["env"]["value"] == "dev"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan hook.

    Startup: optionally seed the Future Gadget Lab data store with
    sample experiments / divergence readings (issue #112). The seed
    itself is a no-op if the store already contains data, so it is
    safe to leave the env var at its default in any environment
    where MOCK mode is on — it will only fill an empty store on
    first start.

    Shutdown: nothing to do; the lifespan completes silently.
    """
    if _should_seed_fgl_test_data():
        # Imported lazily so the lifespan import doesn't pull the
        # data service (and its Cosmos client) at module scope before
        # the user has had a chance to set env vars.
        from db.future_gadget_lab_data_service import seed_test_data_if_empty

        seed_test_data_if_empty(fgl_service, _logger)
    yield


app = FastAPI(
    docs_url="/docs" if is_dev else None,
    redoc_url="/redoc" if is_dev else None,
    openapi_url="/openapi.json" if is_dev else None,
    lifespan=lifespan,
)

from common.log import log_azure_exporter

# Only add custom CORS origins if in development
app.add_middleware(CORSMiddleware,allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Add OpenCensus middleware to capture request telemetry
app.add_middleware( FastAPIMiddleware,  exporter=log_azure_exporter, sampler=ProbabilitySampler(1.0))

# Security headers (issue #98). Added last so this middleware ends up
# OUTERMOST in the stack and therefore sets headers on the final response
# after CORS and OpenCensus have processed it.
app.add_middleware(SecurityHeadersMiddleware)

# Register API Router
app.include_router(api_router, prefix="/api")

# Register Future gadget Router
app.include_router(future_gadget_api_router, prefix="/future-gadget-lab")

# Bring the FGL data service instance into this module's namespace
# so the lifespan hook above can reach it. The import has been moved
# here (after the routers are registered) because creating the
# service also opens a Cosmos connection / in-memory TinyDB — doing
# it at import time was the original sin that issue #112 fixes, and
# keeping it down here keeps the import surface minimal.
from api.future_gadget_api import fgl_service  # noqa: E402,F401

@app.get("/health")
@app.head("/health")
async def health():
    # Issue #100: minimal payload — only the status string is returned.
    #
    # The previous handler returned the host's CPU%, memory breakdown,
    # and uptime to any anonymous caller. That disclosed the App Service
    # SKU (CPU/memory totals fingerprint F1 vs B1 vs P1v3) and how
    # stale the deployment is (uptime tracks the most recent App
    # Service restart, which Azure triggers on every code change). Both
    # signals were reaching attackers without an Authorization header.
    #
    # Azure App Service uses this path itself for its load-balancer
    # health probe (see terraform.tf's ``health_check_path = "/health"``),
    # so the endpoint must stay reachable — the fix is the *content* of
    # the response, not the existence of the route.
    #
    # If detailed metrics are needed later, gate them behind an
    # authenticated endpoint (e.g. ``/api/health/internal`` with
    # ``@required_roles(["Admin"])``) rather than re-exposing them here.
    return {"status": "ok"}


# Frontend Router
# Issue #99: cap on the captured path's length. The handler does
# `dist / path` then `Path.exists()` (an `os.stat()` syscall); on Linux
# that raises ``OSError(Errno 36, "File name too long")`` once the path
# exceeds NAME_MAX (255 bytes per filesystem component), which bubbles
# up as a 500. Short-circuit to the SPA shell for any path that long
# — the path won't match a real file under dist/ anyway, so the SPA
# fallback is the right thing to serve.
MAX_PATH_LEN = 255
dist = Path("./dist")
frontend_router = APIRouter()

# Media types for the asset extensions the Vite build can emit (issue #108).
#
# ``public/`` is copied to ``backend/dist/`` verbatim by Vite, and
# ``src/assets/`` files imported from JSX come out hashed under
# ``backend/dist/assets/``. The extensions below cover everything the
# current build produces plus the asset types a future PR can drop in
# (SVG icons, woff2 web fonts, source maps when sourcemaps are turned
# on, web manifests). Starlette's FileResponse can guess a media_type
# from the filename when this ladder leaves it as ``None``, but
# spelling the mapping out explicitly:
#
#   * keeps the served content-type auditable in one place
#   * avoids surprise if Starlette's guesser changes upstream
#   * ensures browsers interpret a fresh asset the same way across
#     Vite version upgrades
#
# The keys are matched as suffixes against the captured ``path``, so
# ``.mjs``/``.htm``/``.jpeg`` are listed alongside their canonical
# forms (``.js``/``.html``/``.jpg``) to keep both spellings covered.
_STATIC_MEDIA_TYPES = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".htm": "text/html",
    ".json": "application/json",
    ".map": "application/json",  # Vite/Rollup source maps
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/vnd.microsoft.icon",
    ".webmanifest": "application/manifest+json",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
}


@frontend_router.get('/{path:path}')
async def frontend_handler(path: str):
    if len(path) > MAX_PATH_LEN:
        return FileResponse(dist / "index.html", media_type="text/html")

    # Exclude API paths - prevent serving HTML for API routes
    if path.startswith('api/') or path.startswith('future-gadget-lab/'):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="API path not found")


    # Contain SPA catch-all paths to dist/ (issue #109). ``path`` is
    # user-controlled; joining it straight onto ``dist/`` lets a
    # request like ``GET /..%2fsecret.txt`` (URL-encoded ``..`` that
    # survives httpx/Starlette URL normalization) resolve to a real
    # file outside ./dist and serve it with 200.
    #
    # The pattern below is the CodeQL ``py/path-injection``
    # recommended sanitizer shape (see
    # https://codeql.github.com/codeql-query-help/python/py/path-injection/):
    #
    #  1. ``os.path.realpath`` is a recognized
    #     ``Path::PathNormalization`` — collapses ``..`` and follows
    #     symlinks so the candidate is canonical.
    #  2. ``candidate.startswith(dist_realpath + os.sep)`` is a
    #     recognized ``Path::SafeAccessCheck`` barrier guard that
    #     sanitizes the candidate on its True branch. The trailing
    #     ``os.sep`` is load-bearing — it stops
    #     ``dist_realpath = /tmp/dist`` from matching a sibling
    #     ``/tmp/dist_other/secret.txt``.
    #  3. The filesystem access (``os.path.isfile``) MUST come after
    #     the barrier guard so the candidate is already sanitized
    #     when it reaches the sink — CodeQL evaluates ``and`` chains
    #     left-to-right for data flow, so putting ``isfile`` first
    #     re-opens the alert.
    #
    # The regex deny-list (literal ``..`` segments) is belt-and-
    # suspenders: it short-circuits before any path operation runs.
    # The regression tests in ``TestFrontendHandlerPathContainment``
    # (main_test.py) exercise the same logic end-to-end against a
    # real tmp_path dist tree to prove both layers reject path-
    # traversal payloads.
    dist_realpath = os.path.realpath(str(dist))
    fp = os.path.join(dist_realpath, "index.html")
    if path and not re.search(r'(^|/)\.\.($|/)', path):
        candidate_realpath = os.path.realpath(
            os.path.join(dist_realpath, path)
        )
        # ``startswith`` first (barrier guard), then ``isfile``
        # (sink) — see comment block above for why the order is
        # load-bearing for the CodeQL sanitizer model.
        if (
            candidate_realpath.startswith(dist_realpath + os.sep)
            and os.path.isfile(candidate_realpath)
        ):
            fp = candidate_realpath

    # Set the media_type to the entry in ``_STATIC_MEDIA_TYPES``
    # matching the captured ``path``'s suffix. ``None`` is the right
    # answer for any extension not in the map (e.g. ``.txt``) — it
    # lets Starlette guess from the filename and is also the value
    # FileResponse uses for an unknown type.
    media_type = next(
        (mime for ext, mime in _STATIC_MEDIA_TYPES.items()
         if path.endswith(ext)),
        None,
    )

    # There is exactly one FileResponse per served request. A second
    # ``return FileResponse(fp)`` used to sit below this line as
    # unreachable dead code (see issue #108) and was removed.
    return FileResponse(fp, media_type=media_type)
app.include_router(frontend_router, prefix="")



# Bootstrap the app
#
# Canonical entry points — keep these in sync when you change startup flags:
#   - Dev (interactive):  ``python -m uvicorn main:app --reload``
#                        (this is what ``frontend/start-backend.js`` and the
#                        ``FastAPI`` / ``FastAPI - Mock`` VSCode launch
#                        configs in ``.vscode/launch.json`` wrap.)
#   - Prod (Azure App Service): ``gunicorn --worker-class
#                        uvicorn.workers.UvicornWorker main:app``
#                        (set as ``app_command_line`` in ``terraform.tf``).
#   - Smoke-test fallback:  ``python main.py`` from this directory. This
#                        ``__main__`` block exists so that path is usable
#                        without shell gymnastics; do NOT add flags here
#                        without mirroring them in the canonical entries
#                        above, or the three ways of starting the app will
#                        drift (see issue #107).
if __name__ == '__main__':
    uvicorn.run('main:app', reload=True)