from pydantic import BaseModel, EmailStr


# ── Auth ──────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Settings ──────────────────────────────────────────
class SpotifyKeyUpdate(BaseModel):
    spotify_api_key: str


class MessageResponse(BaseModel):
    message: str
