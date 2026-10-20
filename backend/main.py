from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:  # Supports local `main:app` and hosted `backend.main:app` imports.
    from app.routes.experiment import router as experiment_router
    from app.routes.schedule import router as schedule_router
except ModuleNotFoundError:
    from backend.app.routes.experiment import router as experiment_router
    from backend.app.routes.schedule import router as schedule_router


app = FastAPI(
    title="Signal Lab API",
    description="Max-heap adaptive scheduler and reproducible traffic experiment service.",
    version="2.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:4173", "http://127.0.0.1:4173",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)
app.include_router(schedule_router)
app.include_router(experiment_router)


@app.get("/health", tags=["system"], include_in_schema=False)
@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "signal-lab-api", "version": app.version}


# In a single-origin Vercel deployment, serve the compiled React app after API routes.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "dist"
if os.getenv("VERCEL") and FRONTEND_DIST.is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
