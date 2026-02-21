from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.schemas import SpotifyCallback, Token, UserResponse, MessageResponse, DiscoverRequest, DiscoverResponse, CreatePlaylistRequest, CreatePlaylistResponse, SaveTracksRequest, SaveTracksResponse
from app.auth import create_access_token, get_current_user, get_valid_spotify_token, refresh_spotify_token
from app.discover import discover_songs

router = APIRouter()
settings = get_settings()

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_ME_URL = "https://api.spotify.com/v1/me"
SPOTIFY_SCOPES = "user-read-email user-read-private user-top-read user-library-read user-library-modify playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private"


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
    db: Session = Depends(get_db),
):
    spotify_token = await get_valid_spotify_token(current_user, db)

    try:
        result = await discover_songs(
            payload.prompt,
            spotify_token,
            context_songs=payload.context_songs or None,
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Discovery failed: {str(e)}",
        )


# ── Fetch tracks from a Spotify playlist ─────────────
SPOTIFY_API_BASE = "https://api.spotify.com/v1"


@router.get("/my-playlists")
async def get_my_playlists(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all playlists belonging to the current user."""
    spotify_token = await get_valid_spotify_token(current_user, db)

    playlists: list[dict] = []
    url = f"{SPOTIFY_API_BASE}/me/playlists"
    params: dict = {"limit": 50}

    async with httpx.AsyncClient() as client:
        while url:
            resp = await client.get(
                url,
                params=params,
                headers={"Authorization": f"Bearer {spotify_token}"},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Playlists konnten nicht geladen werden.")

            data = resp.json()
            for item in data.get("items", []):
                if not item:
                    continue
                images = item.get("images") or []
                tracks_obj = item.get("tracks") or {}
                playlists.append({
                    "id": item["id"],
                    "name": item.get("name", ""),
                    "image": images[0]["url"] if images else None,
                    "total_tracks": tracks_obj.get("total", 0) if isinstance(tracks_obj, dict) else 0,
                    "owner": (item.get("owner") or {}).get("display_name", ""),
                })

            url = data.get("next")
            params = {}

    return {"playlists": playlists}


@router.get("/playlist-tracks")
async def get_playlist_tracks(
    playlist_id: str | None = None,
    playlist_url: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Extract track names from a Spotify playlist URL or ID."""
    spotify_token = await get_valid_spotify_token(current_user, db)

    # Resolve the playlist ID from whichever param was provided
    resolved_id = playlist_id
    if not resolved_id and playlist_url:
        resolved_id = playlist_url.strip()
        if "spotify.com/playlist/" in resolved_id:
            resolved_id = resolved_id.split("playlist/")[1].split("?")[0].split("/")[0]
        elif "spotify:playlist:" in resolved_id:
            resolved_id = resolved_id.split(":")[-1]

    if not resolved_id:
        raise HTTPException(status_code=400, detail="playlist_id oder playlist_url ist erforderlich.")

    songs: list[str] = []
    url = f"{SPOTIFY_API_BASE}/playlists/{resolved_id}/tracks"
    params: dict = {"limit": 100}

    async with httpx.AsyncClient() as client:
        while url:
            resp = await client.get(
                url,
                params=params,
                headers={"Authorization": f"Bearer {spotify_token}"},
            )
            # If 401/403, try refreshing the token once
            if resp.status_code in (401, 403):
                spotify_token = await refresh_spotify_token(current_user, db)
                resp = await client.get(
                    url,
                    params=params,
                    headers={"Authorization": f"Bearer {spotify_token}"},
                )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=f"Playlist konnte nicht geladen werden: {resp.text[:200]}",
                )

            data = resp.json()
            for item in data.get("items", []):
                track = item.get("track")
                if track and track.get("name"):
                    artist = ", ".join(a["name"] for a in track.get("artists", []))
                    songs.append(f"{track['name']} - {artist}")

            url = data.get("next")
            params = {}  # next URL already includes params

    return {"songs": songs, "total": len(songs)}


@router.post("/create-playlist", response_model=CreatePlaylistResponse)
async def create_playlist(
    payload: CreatePlaylistRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    spotify_token = await get_valid_spotify_token(current_user, db)
    headers = {"Authorization": f"Bearer {spotify_token}"}

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
    db: Session = Depends(get_db),
):
    spotify_token = await get_valid_spotify_token(current_user, db)
    headers = {"Authorization": f"Bearer {spotify_token}"}
    track_uris = [f"spotify:track:{tid}" for tid in payload.track_ids]

    try:
        # 1. Try saving directly to Liked Songs first
        saved_directly = True
        for i in range(0, len(payload.track_ids), 50):
            chunk = payload.track_ids[i : i + 50]
            async with httpx.AsyncClient() as client:
                save_resp = await client.put(
                    f"{SPOTIFY_API_BASE}/me/tracks",
                    headers=headers,
                    json={"ids": chunk},
                )
            if save_resp.status_code not in (200, 201):
                saved_directly = False
                break

        if saved_directly:
            # Check how many were already saved (best-effort)
            already_saved = 0
            return {
                "saved": len(payload.track_ids),
                "already_saved": already_saved,
            }

        # 2. Fallback: Create a playlist instead
        async with httpx.AsyncClient() as client:
            create_resp = await client.post(
                f"{SPOTIFY_API_BASE}/users/{current_user.spotify_id}/playlists",
                headers=headers,
                json={
                    "name": f"SpotiVibe Discover – {len(track_uris)} Songs",
                    "description": "Erstellt mit SpotiVibe AI Discover",
                    "public": False,
                },
            )

        if create_resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Konnte weder Liked Songs noch Playlist erstellen: {create_resp.text}",
            )

        playlist = create_resp.json()
        playlist_id = playlist["id"]

        for i in range(0, len(track_uris), 100):
            chunk = track_uris[i : i + 100]
            async with httpx.AsyncClient() as client:
                add_resp = await client.post(
                    f"{SPOTIFY_API_BASE}/playlists/{playlist_id}/tracks",
                    headers=headers,
                    json={"uris": chunk},
                )

        return {
            "saved": len(payload.track_ids),
            "already_saved": 0,
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


# ── Debug: Check Spotify token scopes ─────────────────
@router.get("/debug/token-info")
async def debug_token_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Debug endpoint to check what scopes the current Spotify token has."""
    spotify_token = await get_valid_spotify_token(current_user, db)

    # Test each relevant endpoint
    results: dict = {"user": current_user.spotify_id}
    async with httpx.AsyncClient() as client:
        # Test /me
        r = await client.get(
            "https://api.spotify.com/v1/me",
            headers={"Authorization": f"Bearer {spotify_token}"},
        )
        results["me_status"] = r.status_code

        # Test /me/playlists
        r = await client.get(
            "https://api.spotify.com/v1/me/playlists?limit=1",
            headers={"Authorization": f"Bearer {spotify_token}"},
        )
        results["playlists_status"] = r.status_code
        if r.status_code == 200:
            data = r.json()
            items = data.get("items", [])
            results["playlists_count"] = data.get("total", 0)
            if items and items[0]:
                results["first_playlist_id"] = items[0].get("id")
                results["first_playlist_tracks"] = items[0].get("tracks", {})

                # Test getting tracks from the first playlist
                pid = items[0]["id"]
                r2 = await client.get(
                    f"https://api.spotify.com/v1/playlists/{pid}/tracks?limit=1",
                    headers={"Authorization": f"Bearer {spotify_token}"},
                )
                results["playlist_tracks_status"] = r2.status_code
                if r2.status_code != 200:
                    results["playlist_tracks_error"] = r2.text[:300]
        else:
            results["playlists_error"] = r.text[:300]

    return results
