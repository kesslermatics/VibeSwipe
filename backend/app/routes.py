from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.schemas import SpotifyCallback, Token, UserResponse, MessageResponse
from app.auth import create_access_token, get_current_user

router = APIRouter()
settings = get_settings()

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_ME_URL = "https://api.spotify.com/v1/me"
SPOTIFY_SCOPES = "user-read-email user-read-private user-top-read user-library-read"


# ── Spotify OAuth: Get login URL ─────────────────────
@router.get("/auth/login")
def spotify_login(redirect_uri: str | None = None):
    """Returns the Spotify authorization URL the frontend should redirect to."""
    # Use the provided redirect_uri if it's in the allowed list, otherwise default to first
    allowed = settings.spotify_redirect_uris
    uri = redirect_uri if redirect_uri in allowed else allowed[0]

    params = {
        "client_id": settings.spotify_client_id,
        "response_type": "code",
        "redirect_uri": uri,
        "scope": SPOTIFY_SCOPES,
        "show_dialog": "true",
    }
    return {"url": f"{SPOTIFY_AUTH_URL}?{urlencode(params)}"}


# ── Spotify OAuth: Exchange code for tokens ───────────
@router.post("/auth/callback", response_model=Token)
async def spotify_callback(payload: SpotifyCallback, db: Session = Depends(get_db)):
    """Exchange the Spotify auth code for tokens, create/update user, return JWT."""

    # Validate redirect_uri
    allowed = settings.spotify_redirect_uris
    if payload.redirect_uri not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid redirect_uri",
        )

    # 1. Exchange code for Spotify access & refresh tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            SPOTIFY_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": payload.code,
                "redirect_uri": payload.redirect_uri,
                "client_id": settings.spotify_client_id,
                "client_secret": settings.spotify_client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if token_resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Spotify token exchange failed: {token_resp.text}",
        )

    token_data = token_resp.json()
    spotify_access_token = token_data["access_token"]
    spotify_refresh_token = token_data.get("refresh_token")

    # 2. Fetch user profile from Spotify
    async with httpx.AsyncClient() as client:
        me_resp = await client.get(
            SPOTIFY_ME_URL,
            headers={"Authorization": f"Bearer {spotify_access_token}"},
        )

    if me_resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to fetch Spotify user profile",
        )

    me = me_resp.json()
    spotify_id = me["id"]
    email = me.get("email")
    display_name = me.get("display_name")

    # 3. Create or update user in DB
    user = db.query(User).filter(User.spotify_id == spotify_id).first()
    if user:
        user.email = email
        user.display_name = display_name
        user.spotify_access_token = spotify_access_token
        user.spotify_refresh_token = spotify_refresh_token or user.spotify_refresh_token
    else:
        user = User(
            spotify_id=spotify_id,
            email=email,
            display_name=display_name,
            spotify_access_token=spotify_access_token,
            spotify_refresh_token=spotify_refresh_token,
        )
        db.add(user)

    db.commit()
    db.refresh(user)

    # 4. Issue our own JWT
    access_token = create_access_token(data={"sub": user.spotify_id})
    return {"access_token": access_token, "token_type": "bearer"}


# ── Get current user info ────────────────────────────
@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ── Health check ──────────────────────────────────────
@router.get("/health")
def health_check():
    return {"status": "ok"}
