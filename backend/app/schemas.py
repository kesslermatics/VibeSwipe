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
