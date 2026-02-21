from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine, Base
from app.routes import router

settings = get_settings()

# Create all tables on startup (dev convenience – use Alembic for production)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="VibeSwipe API",
    version="0.1.0",
    description="Backend API for VibeSwipe",
)

# ── CORS ──────────────────────────────────────────────
origins = [o.strip() for o in settings.cors_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────
app.include_router(router)
