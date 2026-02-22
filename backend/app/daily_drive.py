"""
Daily Drive generator – custom "Daily Drive" playlist.

Flow:
1. Fetch user's top tracks (short_term = "On Repeat") from Spotify
2. Fetch user's saved shows (podcasts)
3. User picks which shows to include
4. Gemini receives all On-Repeat song titles and returns:
   - 20 songs from the On-Repeat list (shuffled selection)
   - 20 NEW songs that match the same vibe but aren't in On-Repeat
5. Fetch random recent episodes from the selected shows
6. Interleave: 4 songs → 1 podcast episode → 4 songs → 1 podcast episode …
7. Create a Spotify playlist with the result
"""

import json
import random
import asyncio
import logging
import time
from datetime import date

import httpx
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

SPOTIFY_API = "https://api.spotify.com/v1"

GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"gemini-3-flash-preview:generateContent?key={settings.gemini_api_key}"
)


async def fetch_on_repeat_tracks(spotify_token: str) -> list[dict]:
    """Fetch user's top tracks (short_term ≈ On Repeat, up to 50)."""
    all_tracks = []
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SPOTIFY_API}/me/top/tracks",
            params={"time_range": "short_term", "limit": 50},
            headers={"Authorization": f"Bearer {spotify_token}"},
        )
    if resp.status_code != 200:
        logger.error(f"Failed to fetch top tracks: {resp.status_code} {resp.text[:300]}")
        raise Exception(f"Could not fetch On-Repeat tracks: {resp.status_code}")

    data = resp.json()
    for item in data.get("items", []):
        all_tracks.append({
            "title": item["name"],
            "artist": ", ".join(a["name"] for a in item.get("artists", [])),
            "uri": item["uri"],
            "id": item["id"],
        })
    return all_tracks


async def fetch_saved_shows(spotify_token: str) -> list[dict]:
    """Fetch user's saved podcast shows."""
    shows = []
    url = f"{SPOTIFY_API}/me/shows"
    params: dict = {"limit": 50}

    async with httpx.AsyncClient() as client:
        while url:
            resp = await client.get(
                url, params=params,
                headers={"Authorization": f"Bearer {spotify_token}"},
            )
            if resp.status_code != 200:
                logger.error(f"Failed to fetch saved shows: {resp.status_code} {resp.text[:300]}")
                raise Exception(f"Could not fetch saved shows: {resp.status_code}")

            data = resp.json()
            for item in data.get("items", []):
                show = item.get("show", {})
                images = show.get("images", [])
                shows.append({
                    "id": show["id"],
                    "name": show.get("name", ""),
                    "publisher": show.get("publisher", ""),
                    "image": images[0]["url"] if images else None,
                    "total_episodes": show.get("total_episodes", 0),
                })
            url = data.get("next")
            params = {}

    return shows


async def fetch_show_episodes(show_id: str, spotify_token: str, limit: int = 10) -> list[dict]:
    """Fetch the most recent episodes of a show."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SPOTIFY_API}/shows/{show_id}/episodes",
            params={"limit": limit, "market": "DE"},
            headers={"Authorization": f"Bearer {spotify_token}"},
        )
    if resp.status_code != 200:
        logger.warning(f"Failed to fetch episodes for show {show_id}: {resp.status_code}")
        return []

    data = resp.json()
    episodes = []
    for ep in data.get("items", []):
        episodes.append({
            "name": ep.get("name", ""),
            "uri": ep.get("uri", ""),
            "id": ep.get("id", ""),
            "duration_ms": ep.get("duration_ms", 0),
            "show_id": show_id,
        })
    return episodes


async def ask_gemini_daily_drive(on_repeat_songs: list[dict]) -> dict:
    """Ask Gemini to curate the Daily Drive song selection."""
    song_list = "\n".join(
        f"- {s['title']} – {s['artist']}" for s in on_repeat_songs
    )

    num_from_repeat = min(20, len(on_repeat_songs))
    num_new = 20

    prompt = f"""You are a music curation expert building a "Daily Drive" playlist.

I will give you a list of songs that the user currently has on repeat (their favorite songs right now).

Your task:
1. Pick exactly {num_from_repeat} songs FROM the provided list. Choose a good mix that flows well together. Use the EXACT titles and artists as given.
2. Recommend exactly {num_new} NEW songs that are NOT in the provided list but perfectly match the style, mood, genre, and energy of these songs. These should be songs the user would likely enjoy but hasn't discovered yet.

Respond ONLY with valid JSON in this exact format, nothing else:
{{
  "from_repeat": [
    {{"title": "Song Name", "artist": "Artist Name"}},
    ...
  ],
  "new_discoveries": [
    {{"title": "Song Name", "artist": "Artist Name"}},
    ...
  ]
}}

Rules:
- "from_repeat" must contain exactly {num_from_repeat} songs that are IN the provided list (use the exact titles/artists given)
- "new_discoveries" must contain exactly {num_new} songs NOT in the provided list
- Mix genres and energies well for a good listening experience
- Only output valid JSON, no markdown, no explanation"""

    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"text": f"Here are the user's On-Repeat songs:\n{song_list}"},
            ]
        }],
        "generationConfig": {
            "temperature": 1.5,
            "maxOutputTokens": 8192,
        },
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(GEMINI_URL, json=payload)

    if resp.status_code != 200:
        logger.error(f"Gemini API error: {resp.status_code} – {resp.text[:500]}")
        raise Exception(f"Gemini API error: {resp.status_code} – {resp.text[:200]}")

    data = resp.json()
    
    # Safely extract text from Gemini response
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        logger.error(f"Unexpected Gemini response structure: {json.dumps(data)[:500]}")
        raise Exception(f"Unerwartete Gemini-Antwort: {e}")

    # Strip markdown code fences if present
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Gemini returned invalid JSON: {text[:500]}")
        raise Exception(f"Gemini hat ungültiges JSON zurückgegeben: {e}")


def _parse_retry_after(headers: dict) -> float:
    """Parse Retry-After header – can be seconds or a Unix timestamp."""
    raw = headers.get("Retry-After", "2")
    try:
        value = int(raw)
    except ValueError:
        return 2.0
    # If the value is absurdly large, it's a Unix timestamp, not seconds
    if value > 300:
        wait = max(0, value - int(time.time()))
        return min(wait, 30)  # cap at 30s to be safe
    return min(value, 30)


async def search_spotify_track(query: str, spotify_token: str) -> dict | None:
    """Search Spotify for a track and return URI + metadata.
    Retries up to 3 times with exponential backoff on rate limits."""
    for attempt in range(3):
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{SPOTIFY_API}/search",
                params={"q": query, "type": "track", "limit": 1},
                headers={"Authorization": f"Bearer {spotify_token}"},
            )
        if resp.status_code == 429:
            wait = _parse_retry_after(dict(resp.headers))
            # Exponential backoff: 3s, 6s, 12s
            backoff = max(wait, 3 * (2 ** attempt))
            logger.warning(f"Spotify 429 (attempt {attempt+1}/3), waiting {backoff:.0f}s for: {query}")
            await asyncio.sleep(backoff)
            continue
        if resp.status_code != 200:
            logger.warning(f"Spotify search failed for '{query}': {resp.status_code}")
            return None
        break
    else:
        logger.warning(f"Spotify search gave up after 3 retries for '{query}'")
        return None

    items = resp.json().get("tracks", {}).get("items", [])
    if not items:
        return None

    track = items[0]
    return {
        "title": track["name"],
        "artist": ", ".join(a["name"] for a in track["artists"]),
        "uri": track["uri"],
        "id": track["id"],
    }


async def generate_daily_drive(
    spotify_token: str,
    spotify_user_id: str,
    selected_show_ids: list[str],
) -> dict:
    """
    Full Daily Drive generation pipeline.
    Returns info about the created playlist.
    """
    # 1. Fetch On-Repeat tracks
    logger.info("Daily Drive: Fetching On-Repeat tracks...")
    on_repeat = await fetch_on_repeat_tracks(spotify_token)
    logger.info(f"Daily Drive: Got {len(on_repeat)} On-Repeat tracks")
    if len(on_repeat) < 5:
        raise Exception(
            "Du brauchst mindestens 5 Songs in deinen Top Tracks (On Repeat). "
            "Hör mehr Musik und versuche es später nochmal!"
        )

    # 2. Ask Gemini to curate
    logger.info("Daily Drive: Asking Gemini to curate songs...")
    gemini_result = await ask_gemini_daily_drive(on_repeat)
    logger.info(
        f"Daily Drive: Gemini returned {len(gemini_result.get('from_repeat', []))} from_repeat, "
        f"{len(gemini_result.get('new_discoveries', []))} new_discoveries"
    )

    # 3. Map "from_repeat" songs back to their Spotify URIs
    on_repeat_map = {}
    for t in on_repeat:
        key = f"{t['title'].lower().strip()}|||{t['artist'].lower().strip()}"
        on_repeat_map[key] = t
        # Also store by title only for fuzzy matching
        title_key = t['title'].lower().strip()
        if title_key not in on_repeat_map:
            on_repeat_map[f"title:::{title_key}"] = t

    from_repeat_uris: list[str] = []
    for song in gemini_result.get("from_repeat", []):
        key = f"{song['title'].lower().strip()}|||{song['artist'].lower().strip()}"
        if key in on_repeat_map:
            from_repeat_uris.append(on_repeat_map[key]["uri"])
        else:
            # Try title-only match
            title_key = f"title:::{song['title'].lower().strip()}"
            if title_key in on_repeat_map:
                from_repeat_uris.append(on_repeat_map[title_key]["uri"])
            else:
                # Fuzzy fallback: search on Spotify
                logger.info(f"Daily Drive: from_repeat song not found in map, searching: {song['title']} - {song['artist']}")
                result = await search_spotify_track(
                    f"{song['title']} {song['artist']}", spotify_token
                )
                if result:
                    from_repeat_uris.append(result["uri"])

    logger.info(f"Daily Drive: Resolved {len(from_repeat_uris)} from_repeat URIs")

    # 4. Search new discoveries on Spotify (sequentially to avoid rate limits)
    logger.info("Daily Drive: Resolving new discoveries on Spotify...")
    new_discovery_uris: list[str] = []
    new_songs = gemini_result.get("new_discoveries", [])
    for i, song in enumerate(new_songs):
        result = await search_spotify_track(
            f"{song['title']} {song['artist']}", spotify_token
        )
        if result:
            new_discovery_uris.append(result["uri"])
        # Small delay between each request
        if i < len(new_songs) - 1:
            await asyncio.sleep(0.3)

    logger.info(f"Daily Drive: Resolved {len(new_discovery_uris)} new discovery URIs")

    # 5. Combine: shuffle both sets for variety
    random.shuffle(from_repeat_uris)
    random.shuffle(new_discovery_uris)

    # Interleave: alternate from_repeat and new_discoveries
    all_song_uris: list[str] = []
    repeat_iter = iter(from_repeat_uris)
    new_iter = iter(new_discovery_uris)
    use_repeat = True
    while True:
        src = repeat_iter if use_repeat else new_iter
        uri = next(src, None)
        if uri is None:
            # Switch to the other source for remaining songs
            other = new_iter if use_repeat else repeat_iter
            for remaining in other:
                all_song_uris.append(remaining)
            break
        all_song_uris.append(uri)
        use_repeat = not use_repeat

    # 6. Fetch podcast episodes if shows were selected
    episode_uris: list[str] = []
    if selected_show_ids:
        episode_tasks = [
            fetch_show_episodes(show_id, spotify_token, limit=10)
            for show_id in selected_show_ids
        ]
        all_episodes_raw = await asyncio.gather(*episode_tasks)

        # Collect all episodes, pick random ones
        all_episodes = []
        for eps in all_episodes_raw:
            all_episodes.extend(eps)

        if all_episodes:
            random.shuffle(all_episodes)
            # We need roughly len(all_song_uris) / 4 episodes
            needed = max(1, len(all_song_uris) // 4)
            chosen_episodes = all_episodes[:needed]
            episode_uris = [ep["uri"] for ep in chosen_episodes]

    # 7. Interleave: 4 songs → 1 episode → 4 songs → 1 episode …
    final_uris: list[str] = []
    song_idx = 0
    ep_idx = 0

    while song_idx < len(all_song_uris):
        # Add up to 4 songs
        chunk = all_song_uris[song_idx: song_idx + 4]
        final_uris.extend(chunk)
        song_idx += 4

        # Add 1 episode if available
        if ep_idx < len(episode_uris):
            final_uris.append(episode_uris[ep_idx])
            ep_idx += 1

    # 8. Create the Spotify playlist
    logger.info(f"Daily Drive: Creating playlist with {len(final_uris)} items...")
    today = date.today().strftime("%d.%m.%Y")
    playlist_name = f"Daily Drive – {today}"
    playlist_desc = (
        f"Dein persönlicher Daily Drive von VibeSwipe 🚗 "
        f"{len(from_repeat_uris)} On-Repeat Songs, "
        f"{len(new_discovery_uris)} neue Entdeckungen"
        f"{f', {len(episode_uris)} Podcast-Folgen' if episode_uris else ''}"
    )

    headers = {"Authorization": f"Bearer {spotify_token}"}

    async with httpx.AsyncClient() as client:
        # Create playlist via /me/playlists (avoids 403 with /users/{id}/playlists)
        create_resp = await client.post(
            f"{SPOTIFY_API}/me/playlists",
            headers=headers,
            json={
                "name": playlist_name,
                "description": playlist_desc,
                "public": False,
            },
        )

    if create_resp.status_code not in (200, 201):
        raise Exception(f"Playlist konnte nicht erstellt werden: {create_resp.text}")

    playlist = create_resp.json()
    playlist_id = playlist["id"]

    # Add items in chunks of 100
    for i in range(0, len(final_uris), 100):
        chunk = final_uris[i: i + 100]
        async with httpx.AsyncClient() as client:
            add_resp = await client.post(
                f"{SPOTIFY_API}/playlists/{playlist_id}/items",
                headers=headers,
                json={"uris": chunk},
            )
        if add_resp.status_code not in (200, 201):
            logger.error(f"Failed to add items to playlist: {add_resp.status_code} {add_resp.text[:300]}")

    return {
        "playlist_url": playlist["external_urls"]["spotify"],
        "playlist_id": playlist_id,
        "playlist_name": playlist_name,
        "total_tracks": len(final_uris),
        "on_repeat_count": len(from_repeat_uris),
        "new_discoveries_count": len(new_discovery_uris),
        "episodes_count": len(episode_uris),
    }
