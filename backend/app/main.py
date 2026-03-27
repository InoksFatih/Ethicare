import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load .env BEFORE any app imports that read os.environ at module level.
# main.py lives in backend/app/, but the env file is backend/.env.
_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.cases import router as cases_router
from app.routes.classroom import router as classroom_router
from app.routes.live_mode import router as live_mode_router
from app.services import engine
from app.services.session_manager import session_manager

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


# ── Background cleanup ────────────────────────────────────────────────────────

async def _cleanup_loop() -> None:
    """Periodically evict expired sessions and play sessions."""
    while True:
        await asyncio.sleep(600)  # every 10 minutes
        try:
            expired_sessions = session_manager.cleanup_expired()
            expired_play     = engine.cleanup_play_sessions()
            if expired_sessions or expired_play:
                logger.info(
                    "Cleanup: removed %d classroom session(s), %d play session(s).",
                    expired_sessions,
                    expired_play,
                )
        except Exception as exc:
            logger.warning("Cleanup task error: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_cleanup_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="EthiCare API",
    description="Medical Ethics Training Simulator — Backend",
    version="1.1.0",
    lifespan=lifespan,
)

# CORS origins are read from CORS_ORIGINS env var (comma-separated) so the same
# binary works in dev, staging, and production without code changes.
# Example .env entry: CORS_ORIGINS=http://localhost:3000,https://ethicare.example.com
_raw_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cases_router)
app.include_router(classroom_router)
app.include_router(live_mode_router)


@app.get("/")
def root():
    """Railway/browser sanity check — there is no SPA at `/`; use `/docs` or `/health`."""
    return {
        "service":          "EthiCare API",
        "version":          "1.1.0",
        "health":           "/health",
        "openapi_docs":     "/docs",
        "cases":            "/cases/",
        "classroom_prefix": "/classroom",
        "live_mode_prefix": "/live-mode",
    }


@app.get("/health")
def health():
    return {
        "status":           "ok",
        "service":          "EthiCare API v1.1",
        "active_sessions":  len(session_manager.sessions),
    }