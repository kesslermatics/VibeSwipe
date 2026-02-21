from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql://user:password@localhost:5432/vibeswipe"
    secret_key: str = "change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,https://vibeswipe.kesslermatics.com"
    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    spotify_redirect_uri: str = "http://127.0.0.1:5173/callback,https://vibeswipe.kesslermatics.com/callback"
    gemini_api_key: str = ""

    @property
    def spotify_redirect_uris(self) -> list[str]:
        return [u.strip() for u in self.spotify_redirect_uri.split(",")]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
