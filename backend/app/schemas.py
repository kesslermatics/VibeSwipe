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
