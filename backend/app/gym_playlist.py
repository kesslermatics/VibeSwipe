from pydantic import BaseModel
import httpx
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from app.auth import get_current_user, get_valid_spotify_token
from app.models import User
from app.schemas import GymPlaylistRequest, GymPlaylistResponse
from app.database import get_db
from app.discover import ask_gemini
import random

class GymPlaylistRequest(BaseModel):
    playlist_ids: list[str]

class GymPlaylistResponse(BaseModel):
    playlist_url: str
    playlist_id: str
    name: str
    total_tracks: int
    inspiration_songs: list[str]
    gemini_prompt: str

async def generate_gym_playlist(
    payload: GymPlaylistRequest,
    current_user: User,
    db: Session,
):
    spotify_token = await get_valid_spotify_token(current_user, db)
    # 1. Hole Songs aus den gewählten Playlists
    all_tracks = []
    playlist_names = []
    async with httpx.AsyncClient() as client:
        for pid in payload.playlist_ids:
            r = await client.get(
                f"https://api.spotify.com/v1/playlists/{pid}/tracks",
                headers={"Authorization": f"Bearer {spotify_token}"},
                params={"fields": "items(track(name,artists(name))),total", "limit": 100},
            )
            if r.status_code == 200:
                tracks = r.json()["items"]
                for t in tracks:
                    track = t["track"]
                    if track:
                        name = track["name"]
                        artist = track["artists"][0]["name"]
                        all_tracks.append(f"{name} - {artist}")
                playlist_names.append(pid)
    # 2. Wähle bis zu 10 Inspiration-Songs
    inspiration = random.sample(all_tracks, min(10, len(all_tracks)))
    # 3. Baue Prompt für Gemini
    prompt = (
        "Erstelle eine Gym/Workout Playlist mit 25 Songs, die richtig motivieren, Power geben und Testosteron pushen. "
        "Die ersten 10 Songs sollen sich am Stil und Geschmack dieser Songs orientieren: "
        + ", ".join(inspiration)
        + ". Die restlichen 15 Songs sollen noch mehr auf Energie, Kraft, Motivation und Gym-Vibes setzen. "
        "Bitte keine Songs doppelt, keine Balladen, keine ruhigen Songs. Nur Tracks, die beim Training richtig pushen! "
        "Gib die Antwort als JSON wie gehabt zurück."
    )
    gemini_result = await ask_gemini(prompt, context_songs=inspiration)
    # 4. Suche Spotify-URIs für die Gemini-Songs
    uris = []
    async with httpx.AsyncClient() as client:
        for song in gemini_result["songs"]:
            q = f"{song['title']} {song['artist']}"
            r = await client.get(
                "https://api.spotify.com/v1/search",
                headers={"Authorization": f"Bearer {spotify_token}"},
                params={"q": q, "type": "track", "limit": 1},
            )
            if r.status_code == 200:
                items = r.json().get("tracks", {}).get("items", [])
                if items:
                    uris.append(items[0]["uri"])
    # 5. Erstelle Playlist bei Spotify
    playlist_name = "🏋️‍♂️ Gym Power Mix"
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"https://api.spotify.com/v1/users/{current_user.spotify_id}/playlists",
            headers={"Authorization": f"Bearer {spotify_token}"},
            json={"name": playlist_name, "description": "Dein Gym Power Mix von VibeSwipe", "public": False},
        )
        if r.status_code != 201:
            raise HTTPException(500, "Playlist konnte nicht erstellt werden")
        playlist = r.json()
        playlist_id = playlist["id"]
        playlist_url = playlist["external_urls"]["spotify"]
        # Füge Songs hinzu
        for i in range(0, len(uris), 100):
            await client.post(
                f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks",
                headers={"Authorization": f"Bearer {spotify_token}"},
                json={"uris": uris[i:i+100]},
            )
    return GymPlaylistResponse(
        playlist_url=playlist_url,
        playlist_id=playlist_id,
        name=playlist_name,
        total_tracks=len(uris),
        inspiration_songs=inspiration,
        gemini_prompt=prompt,
    )
