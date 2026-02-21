from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.schemas import SpotifyCallback, Token, UserResponse, MessageResponse, DiscoverRequest, DiscoverResponse, CreatePlaylistRequest, CreatePlaylistResponse, SaveTracksRequest, SaveTracksResponse
from app.auth import create_access_token, get_current_user
from app.discover import discover_songs

router = APIRouter()
settings = get_settings()

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_ME_URL = "https://api.spotify.com/v1/me"
SPOTIFY_SCOPES = "user-read-email user-read-private user-top-read user-library-read user-library-modify playlist-modify-public playlist-modify-private"


def _normalize_uri(uri: str) -> str:
    """Spotify requires 127.0.0.1 instead of localhost for local dev."""
    return uri.replace("://localhost:", "://127.0.0.1:")


# ── Spotify OAuth: Get login URL ─────────────────────
@router.get("/auth/login")
def spotify_login(redirect_uri: str | None = None):
    """Returns the Spotify authorization URL the frontend should redirect to."""
    allowed = [_normalize_uri(u) for u in settings.spotify_redirect_uris]

    # Default to first allowed URI
    uri = allowed[0]
    if redirect_uri:
        normalized = _normalize_uri(redirect_uri)
        if normalized in allowed:
            uri = normalized

    params = {
        "client_id": settings.spotify_client_id,
        "response_type": "code",
        "redirect_uri": uri,
        "scope": SPOTIFY_SCOPES,
        "show_dialog": "true",
    }
    return {"url": f"{SPOTIFY_AUTH_URL}?{urlencode(params)}", "redirect_uri": uri}


# ── Spotify OAuth: Exchange code for tokens ───────────
@router.post("/auth/callback", response_model=Token)
async def spotify_callback(payload: SpotifyCallback, db: Session = Depends(get_db)):
    """Exchange the Spotify auth code for tokens, create/update user, return JWT."""

    # Validate redirect_uri (normalize localhost ↔ 127.0.0.1)
    allowed = [_normalize_uri(u) for u in settings.spotify_redirect_uris]
    resolved_uri = _normalize_uri(payload.redirect_uri)
    if resolved_uri not in allowed:
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
                "redirect_uri": resolved_uri,
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


# ── Discover songs via Gemini + Spotify ──────────────
@router.post("/discover", response_model=DiscoverResponse)
async def discover(
    payload: DiscoverRequest,
    current_user: User = Depends(get_current_user),
):
    if not current_user.spotify_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Spotify access token found. Please re-login.",
        )

    try:
        result = await discover_songs(payload.prompt, current_user.spotify_access_token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Discovery failed: {str(e)}",
        )


# ── Create Spotify playlist from liked songs ─────────
SPOTIFY_API_BASE = "https://api.spotify.com/v1"


@router.post("/create-playlist", response_model=CreatePlaylistResponse)
async def create_playlist(
    payload: CreatePlaylistRequest,
    current_user: User = Depends(get_current_user),
):
    if not current_user.spotify_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Spotify access token found. Please re-login.",
        )

    headers = {"Authorization": f"Bearer {current_user.spotify_access_token}"}

    try:
        async with httpx.AsyncClient() as client:
            # 1. Create an empty playlist on the user's account
            create_resp = await client.post(
                f"{SPOTIFY_API_BASE}/users/{current_user.spotify_id}/playlists",
                headers=headers,
                json={
                    "name": payload.name,
                    "description": payload.description,
                    "public": False,
                },
            )

        if create_resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to create playlist: {create_resp.text}",
            )

        playlist = create_resp.json()
        playlist_id = playlist["id"]

        # 2. Add tracks in chunks of 100 (Spotify limit)
        for i in range(0, len(payload.track_uris), 100):
            chunk = payload.track_uris[i : i + 100]
            async with httpx.AsyncClient() as client:
                add_resp = await client.post(
                    f"{SPOTIFY_API_BASE}/playlists/{playlist_id}/tracks",
                    headers=headers,
                    json={"uris": chunk},
                )
            if add_resp.status_code not in (200, 201):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to add tracks: {add_resp.text}",
                )

        return {
            "playlist_url": playlist["external_urls"]["spotify"],
            "playlist_id": playlist_id,
            "name": payload.name,
            "total_tracks": len(payload.track_uris),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Playlist creation failed: {str(e)}",
        )


# ── Save tracks to Liked Songs ───────────────────────
@router.post("/save-tracks", response_model=SaveTracksResponse)
async def save_tracks(
    payload: SaveTracksRequest,
    current_user: User = Depends(get_current_user),
):
    if not current_user.spotify_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Spotify access token found. Please re-login.",
        )

    headers = {"Authorization": f"Bearer {current_user.spotify_access_token}"}

    try:
        # 1. Check which tracks are already saved (best-effort, skip on error)
        already_saved = 0
        try:
            for i in range(0, len(payload.track_ids), 50):
                chunk = payload.track_ids[i : i + 50]
                async with httpx.AsyncClient() as client:
                    check_resp = await client.get(
                        f"{SPOTIFY_API_BASE}/me/tracks/contains",
                        headers=headers,
                        params={"ids": ",".join(chunk)},
                    )
                if check_resp.status_code == 200:
                    already_saved += sum(1 for x in check_resp.json() if x)
        except Exception:
            already_saved = 0  # Skip check if it fails

        # 2. Save in chunks of 50 (Spotify limit)
        for i in range(0, len(payload.track_ids), 50):
            chunk = payload.track_ids[i : i + 50]
            async with httpx.AsyncClient() as client:
                save_resp = await client.put(
                    f"{SPOTIFY_API_BASE}/me/tracks",
                    headers=headers,
                    json={"ids": chunk},
                )
            if save_resp.status_code not in (200, 201):
                error_detail = save_resp.text
                # If it's a scope issue, give a clear message
                if save_resp.status_code == 403 or "insufficient" in error_detail.lower():
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Spotify braucht neue Berechtigungen. Bitte logge dich neu ein.",
                    )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Spotify error: {error_detail}",
                )

        return {
            "saved": len(payload.track_ids) - already_saved,
            "already_saved": already_saved,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Saving tracks failed: {str(e)}",
        )


# ── Health check ──────────────────────────────────────
@router.get("/health")
def health_check():
    return {"status": "ok"}
