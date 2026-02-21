import json
import httpx
from app.config import get_settings

settings = get_settings()

GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"gemini-3-flash-preview:generateContent?key={settings.gemini_api_key}"
)

SPOTIFY_SEARCH_URL = "https://api.spotify.com/v1/search"

SYSTEM_PROMPT = """You are a music recommendation expert. The user will describe a mood, vibe, activity, or specific song preferences.

Your job is to recommend exactly 30 songs that perfectly match their request.

Respond ONLY with valid JSON in this exact format, nothing else:
{
  "mood_summary": "A short 1-sentence description of the vibe/mood you interpreted",
  "songs": [
    {"title": "Song Name", "artist": "Artist Name"},
    ...
  ]
}

Rules:
- Always recommend exactly 30 songs
- Mix well-known and lesser-known tracks
- Consider the language/culture of the request (e.g. German input → include some German/European artists)
- Only output valid JSON, no markdown, no explanation"""


async def ask_gemini(prompt: str) -> dict:
    """Ask Gemini to interpret the mood and suggest songs."""
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": SYSTEM_PROMPT},
                    {"text": f"User request: {prompt}"},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 2.0,
            "maxOutputTokens": 4096,
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(GEMINI_URL, json=payload)

    if resp.status_code != 200:
        raise Exception(f"Gemini API error: {resp.status_code} – {resp.text}")

    data = resp.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]

    # Strip markdown code fences if present
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]  # remove first line
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    return json.loads(text)


async def search_spotify(query: str, spotify_token: str) -> dict | None:
    """Search Spotify for a track and return the first result, including preview URL."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            SPOTIFY_SEARCH_URL,
            params={"q": query, "type": "track", "limit": 1, "market": "DE"},
            headers={"Authorization": f"Bearer {spotify_token}"},
        )

    if resp.status_code != 200:
        return None

    items = resp.json().get("tracks", {}).get("items", [])
    if not items:
        return None

    track = items[0]
    album_images = track.get("album", {}).get("images", [])
    preview_url = track.get("preview_url")

    # If no preview_url from search, try fetching the track directly with market
    if not preview_url and track.get("id"):
        try:
            async with httpx.AsyncClient() as client:
                track_resp = await client.get(
                    f"https://api.spotify.com/v1/tracks/{track['id']}",
                    params={"market": "DE"},
                    headers={"Authorization": f"Bearer {spotify_token}"},
                )
            if track_resp.status_code == 200:
                preview_url = track_resp.json().get("preview_url")
        except Exception:
            pass

    return {
        "title": track["name"],
        "artist": ", ".join(a["name"] for a in track["artists"]),
        "spotify_url": track["external_urls"].get("spotify"),
        "album_image": album_images[0]["url"] if album_images else None,
        "preview_url": preview_url,
        "spotify_uri": track.get("uri"),
    }


async def discover_songs(prompt: str, spotify_token: str) -> dict:
    """Full pipeline: Gemini interprets mood → Spotify searches for each song."""
    gemini_result = await ask_gemini(prompt)

    songs = []
    for song in gemini_result.get("songs", []):
        query = f"{song['title']} {song['artist']}"
        spotify_data = await search_spotify(query, spotify_token)
        if spotify_data:
            songs.append(spotify_data)
        else:
            # Fallback: include Gemini suggestion without Spotify data
            songs.append({
                "title": song["title"],
                "artist": song["artist"],
                "spotify_url": None,
                "album_image": None,
                "preview_url": None,
                "spotify_uri": None,
            })

    return {
        "mood_summary": gemini_result.get("mood_summary", ""),
        "songs": songs,
    }
