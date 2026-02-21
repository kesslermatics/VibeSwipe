from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User

settings = get_settings()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/callback")

SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"


# ── JWT helpers ───────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


# ── Spotify token refresh ────────────────────────────
async def refresh_spotify_token(user: User, db: Session) -> str:
    """Refresh the Spotify access token using the refresh token.
    Updates the DB and returns the new access token."""
    if not user.spotify_refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token available. Please re-login.",
        )

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            SPOTIFY_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": user.spotify_refresh_token,
                "client_id": settings.spotify_client_id,
                "client_secret": settings.spotify_client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Spotify token refresh failed. Please re-login.",
        )

    data = resp.json()
    user.spotify_access_token = data["access_token"]
    # Spotify may return a new refresh token
    if "refresh_token" in data:
        user.spotify_refresh_token = data["refresh_token"]
    db.commit()

    return data["access_token"]


async def get_valid_spotify_token(user: User, db: Session) -> str:
    """Get a valid Spotify access token, refreshing if needed.
    Tries the current token with a test call; if 401/403, refreshes."""
    if not user.spotify_access_token:
        raise HTTPException(status_code=400, detail="No Spotify token. Please re-login.")

    # Quick check: try a lightweight Spotify API call
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.spotify.com/v1/me",
            headers={"Authorization": f"Bearer {user.spotify_access_token}"},
        )

    if resp.status_code in (401, 403):
        # Token expired or missing scopes → refresh
        return await refresh_spotify_token(user, db)

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="Spotify API error.")

    return user.spotify_access_token


# ── Current-user dependency ───────────────────────────
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        spotify_id: Optional[str] = payload.get("sub")
        if spotify_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.spotify_id == spotify_id).first()
    if user is None:
        raise credentials_exception
    return user
