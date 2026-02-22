from pydantic import BaseModel


# ── Auth ──────────────────────────────────────────────
class SpotifyCallback(BaseModel):
    code: str
    redirect_uri: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    spotify_id: str
    email: str | None
    display_name: str | None

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    message: str


# ── Discover ──────────────────────────────────────────
class DiscoverRequest(BaseModel):
    prompt: str
    context_songs: list[str] = []  # e.g. ["Song - Artist", ...] from a playlist


class SongResult(BaseModel):
    title: str
    artist: str
    spotify_url: str | None = None
    album_image: str | None = None
    preview_url: str | None = None
    spotify_uri: str | None = None


class DiscoverResponse(BaseModel):
    songs: list[SongResult]
    mood_summary: str


# ── Playlist ──────────────────────────────────────────
class CreatePlaylistRequest(BaseModel):
    name: str
    description: str = ""
    track_uris: list[str]


class CreatePlaylistResponse(BaseModel):
    playlist_url: str
    playlist_id: str
    name: str
    total_tracks: int


# ── Save Tracks (Lieblingssongs) ──────────────────────
class SaveTracksRequest(BaseModel):
    track_ids: list[str]  # Spotify track IDs (not URIs)


class SaveTracksResponse(BaseModel):
    saved: int
    already_saved: int


# ── Daily Drive ───────────────────────────────────────
class DailyDriveRequest(BaseModel):
    selected_show_ids: list[str] = []  # Spotify show IDs the user picked


class DailyDriveResponse(BaseModel):
    playlist_url: str
    playlist_id: str
    playlist_name: str
    total_tracks: int
    on_repeat_count: int
    new_discoveries_count: int
    episodes_count: int
