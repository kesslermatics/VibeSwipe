const API_BASE = "https://vibeswipe-production.up.railway.app";

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export async function api<T>(
  endpoint: string,
  { method = "GET", body, token }: ApiOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function getUserPlaylists() {
  const token = localStorage.getItem("token") || "";
  const res = await api<{ playlists: any[] }>("/my-playlists", { token });
  return res.playlists;
}

// ── Swipe Deck ──────────────────────────────────────
export interface SwipeTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  album_image: string | null;
  preview_url: string;
  spotify_uri: string;
}

export async function getSwipeDeck(playlistId: string): Promise<SwipeTrack[]> {
  const token = localStorage.getItem("token") || "";
  const res = await api<{ tracks: SwipeTrack[] }>(`/discover/swipe?playlist_id=${encodeURIComponent(playlistId)}`, { token });
  return res.tracks;
}

export async function saveTrack(trackId: string, playlistId: string): Promise<void> {
  const token = localStorage.getItem("token") || "";
  await api(`/library/save?playlist_id=${encodeURIComponent(playlistId)}`, {
    method: "POST",
    body: { track_ids: [trackId] },
    token,
  });
}

// ── Vibe Roast ──────────────────────────────────────
export interface AudioFeatures {
  danceability: number;
  energy: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  tempo: number;
}

export interface RoastResult {
  persona: string;
  roast: string;
  audio_features: AudioFeatures;
  top_genres: string[];
  top_artists: string[];
  track_count: number;
}

export async function getRoast(): Promise<RoastResult> {
  const token = localStorage.getItem("token") || "";
  return api<RoastResult>("/vibe-roast", { token });
}
