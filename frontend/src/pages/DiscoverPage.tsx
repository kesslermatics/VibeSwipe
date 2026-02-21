import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface Song {
    title: string;
    artist: string;
    spotify_url: string | null;
    album_image: string | null;
    preview_url: string | null;
    spotify_uri: string | null;
}

interface DiscoverResult {
    songs: Song[];
    mood_summary: string;
}

interface SaveResult {
    saved: number;
    already_saved: number;
}

interface PlaylistTracksResult {
    songs: string[];
    total: number;
}

interface SpotifyPlaylist {
    id: string;
    name: string;
    image: string | null;
    total_tracks: number;
    owner: string;
}

interface MyPlaylistsResult {
    playlists: SpotifyPlaylist[];
}

function extractTrackId(uri: string | null): string | null {
    if (!uri) return null;
    const parts = uri.split(":");
    return parts.length === 3 ? parts[2] : null;
}

export default function DiscoverPage({ onLogout: _onLogout }: { onLogout: () => void }) {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [prompt, setPrompt] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<DiscoverResult | null>(null);
    const [error, setError] = useState("");

    // Per-song saved state
    const [savedSongs, setSavedSongs] = useState<Set<number>>(new Set());
    const [savingIdx, setSavingIdx] = useState<number | null>(null);

    // Save all
    const [savingAll, setSavingAll] = useState(false);
    const [saveAllResult, setSaveAllResult] = useState<SaveResult | null>(null);

    // Spotify Embed player
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    // Playlist context
    const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
    const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
    const [loadingPlaylists, setLoadingPlaylists] = useState(false);
    const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null);
    const [contextSongs, setContextSongs] = useState<string[]>([]);
    const [loadingPlaylistTracks, setLoadingPlaylistTracks] = useState(false);

    const toggleEmbed = (idx: number) => {
        setExpandedIdx(expandedIdx === idx ? null : idx);
    };

    const openPlaylistPicker = async () => {
        setShowPlaylistPicker(true);
        if (playlists.length > 0) return; // already loaded
        setLoadingPlaylists(true);
        setError("");
        try {
            const data = await api<MyPlaylistsResult>("/my-playlists", {
                method: "GET",
                token: token || "",
            });
            setPlaylists(data.playlists);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Playlists konnten nicht geladen werden");
        } finally {
            setLoadingPlaylists(false);
        }
    };

    const selectPlaylist = async (playlist: SpotifyPlaylist) => {
        setSelectedPlaylist(playlist);
        setShowPlaylistPicker(false);
        setLoadingPlaylistTracks(true);
        setError("");
        try {
            const data = await api<PlaylistTracksResult>(
                `/playlist-tracks?playlist_id=${encodeURIComponent(playlist.id)}`,
                { method: "GET", token: token || "" }
            );
            setContextSongs(data.songs);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "";
            setError(msg || "Playlist-Songs konnten nicht geladen werden");
            setSelectedPlaylist(null);
        } finally {
            setLoadingPlaylistTracks(false);
        }
    };

    const clearPlaylistContext = () => {
        setContextSongs([]);
        setSelectedPlaylist(null);
        setShowPlaylistPicker(false);
    };

    const handleDiscover = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setError("");
        setResult(null);
        setSavedSongs(new Set());
        setSaveAllResult(null);
        setExpandedIdx(null);
        setLoading(true);

        try {
            const data = await api<DiscoverResult>("/discover", {
                method: "POST",
                body: {
                    prompt: prompt.trim(),
                    context_songs: contextSongs,
                },
                token: token || "",
            });
            setResult(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Etwas ist schiefgelaufen");
        } finally {
            setLoading(false);
        }
    };

    const saveSingleSong = async (idx: number) => {
        if (!result || savedSongs.has(idx)) return;
        const song = result.songs[idx];
        const trackId = extractTrackId(song.spotify_uri);
        if (!trackId) return;

        setSavingIdx(idx);
        try {
            await api<SaveResult>("/save-tracks", {
                method: "POST",
                body: { track_ids: [trackId] },
                token: token || "",
            });
            setSavedSongs((prev) => new Set(prev).add(idx));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Song konnte nicht gespeichert werden");
        } finally {
            setSavingIdx(null);
        }
    };

    const saveAllSongs = async () => {
        if (!result) return;
        const trackIds = result.songs
            .map((s) => extractTrackId(s.spotify_uri))
            .filter((id): id is string => !!id);

        if (trackIds.length === 0) return;

        setSavingAll(true);
        setError("");
        try {
            const data = await api<SaveResult>("/save-tracks", {
                method: "POST",
                body: { track_ids: trackIds },
                token: token || "",
            });
            setSaveAllResult(data);
            // Mark all as saved
            const allIdx = new Set<number>();
            result.songs.forEach((_, i) => allIdx.add(i));
            setSavedSongs(allIdx);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Songs konnten nicht gespeichert werden");
        } finally {
            setSavingAll(false);
        }
    };

    return (
        <div className="min-h-screen px-4 py-8 pb-24">
            <div className="mx-auto max-w-2xl">
                {/* Header */}
                <div className="mb-8 flex items-center gap-4">
                    <button
                        onClick={() => navigate("/")}
                        className="rounded-lg p-2 text-gray-400 ring-1 ring-white/10 transition hover:text-white hover:ring-white/20"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            <span className="text-green-400">Discover</span>
                        </h1>
                        <p className="text-sm text-gray-400">Beschreibe deine Stimmung oder was du hören willst</p>
                    </div>
                </div>

                {/* Search Form */}
                <form onSubmit={handleDiscover} className="mb-8">
                    <div className="glass rounded-2xl p-4">
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={
                                selectedPlaylist
                                    ? `„${selectedPlaylist.name}" als Inspiration geladen (${contextSongs.length} Songs)! Beschreibe, was du entdecken willst…`
                                    : 'z.B. "Chill Lo-Fi zum Lernen", "Party Songs wie bei Tomorrowland", "Melancholische Indie Songs für einen Regentag"...'
                            }
                            rows={3}
                            className="w-full resize-none bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none"
                        />

                        {/* Playlist context section */}
                        <div className="mt-3 border-t border-white/5 pt-3">
                            {/* Button to open picker */}
                            {!showPlaylistPicker && !selectedPlaylist && (
                                <button
                                    type="button"
                                    onClick={openPlaylistPicker}
                                    className="flex items-center gap-2 text-xs text-gray-500 transition hover:text-purple-400"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                    </svg>
                                    Playlist als Inspiration hinzufügen
                                </button>
                            )}

                            {/* Playlist picker grid */}
                            {showPlaylistPicker && !selectedPlaylist && (
                                <div>
                                    <div className="mb-2 flex items-center justify-between">
                                        <p className="text-xs font-medium text-gray-400">Wähle eine Playlist:</p>
                                        <button
                                            type="button"
                                            onClick={() => setShowPlaylistPicker(false)}
                                            className="rounded-lg p-1 text-gray-500 transition hover:text-gray-300"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                    {loadingPlaylists ? (
                                        <div className="flex items-center justify-center py-6">
                                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                                        </div>
                                    ) : (
                                        <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg pr-1">
                                            {playlists.map((pl) => (
                                                <button
                                                    key={pl.id}
                                                    type="button"
                                                    onClick={() => selectPlaylist(pl)}
                                                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
                                                >
                                                    <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-gray-800">
                                                        {pl.image ? (
                                                            <img src={pl.image} alt={pl.name} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center text-sm text-gray-600">🎵</div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-xs font-medium text-gray-200">{pl.name}</p>
                                                        <p className="text-[10px] text-gray-500">{pl.total_tracks > 0 ? `${pl.total_tracks} Songs · ` : ""}{pl.owner}</p>
                                                    </div>
                                                </button>
                                            ))}
                                            {playlists.length === 0 && !loadingPlaylists && (
                                                <p className="py-4 text-center text-xs text-gray-500">Keine Playlists gefunden</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Selected playlist badge */}
                            {selectedPlaylist && (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded bg-gray-800">
                                            {selectedPlaylist.image ? (
                                                <img src={selectedPlaylist.image} alt={selectedPlaylist.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center text-xs text-gray-600">🎵</div>
                                            )}
                                        </div>
                                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2.5 py-1 text-xs font-medium text-purple-400 ring-1 ring-purple-500/30">
                                            {selectedPlaylist.name}
                                            {loadingPlaylistTracks ? (
                                                <div className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                                            ) : (
                                                <span className="ml-1 text-purple-400/60">· {contextSongs.length} Songs</span>
                                            )}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={clearPlaylistContext}
                                        className="text-xs text-gray-500 transition hover:text-red-400"
                                    >
                                        Entfernen
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                            <p className="text-xs text-gray-500">Powered by Gemini AI + Spotify</p>
                            <button
                                type="submit"
                                disabled={loading || !prompt.trim()}
                                className="flex items-center gap-2 rounded-xl bg-green-500 px-5 py-2.5 text-sm font-semibold text-gray-950 transition hover:bg-green-400 disabled:opacity-50"
                            >
                                {loading ? (
                                    <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-950 border-t-transparent" />
                                        Suche…
                                    </>
                                ) : (
                                    <>
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        Entdecken
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>

                {/* Error */}
                {error && (
                    <div className="mb-6 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 ring-1 ring-red-500/20">
                        {error}
                    </div>
                )}

                {/* Save all result */}
                {saveAllResult && (
                    <div className="mb-6 rounded-xl bg-green-500/10 p-4 ring-1 ring-green-500/20">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">💚</span>
                            <div>
                                <p className="text-sm font-semibold text-green-400">
                                    {saveAllResult.saved} neue Songs in deinen Lieblingssongs gespeichert!
                                </p>
                                {saveAllResult.already_saved > 0 && (
                                    <p className="text-xs text-gray-400">
                                        {saveAllResult.already_saved} waren schon drin
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Results */}
                {result && (
                    <div>
                        {/* Mood Summary */}
                        <div className="mb-4 rounded-xl bg-green-500/10 px-4 py-3 text-sm text-green-400 ring-1 ring-green-500/20">
                            🎯 {result.mood_summary}
                        </div>

                        {/* Song List */}
                        <div className="space-y-2">
                            {result.songs.map((song, i) => {
                                const isSaved = savedSongs.has(i);
                                const isSaving = savingIdx === i;
                                const isExpanded = expandedIdx === i;
                                const trackId = extractTrackId(song.spotify_uri);

                                return (
                                    <div
                                        key={i}
                                        className={`overflow-hidden rounded-xl transition-all ${isSaved
                                            ? "bg-green-500/10 ring-1 ring-green-500/30"
                                            : "glass-light hover:ring-1 hover:ring-white/10"
                                            }`}
                                    >
                                        <div className="flex items-center gap-3 p-3">
                                            {/* Album Art – click to toggle embed */}
                                            <button
                                                onClick={() => trackId && toggleEmbed(i)}
                                                disabled={!trackId}
                                                className="group relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-800 disabled:cursor-default"
                                            >
                                                {song.album_image ? (
                                                    <img src={song.album_image} alt={song.title} className="h-full w-full object-cover" />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center text-lg text-gray-600">🎵</div>
                                                )}
                                                {/* Play/Pause overlay */}
                                                {trackId && (
                                                    <div className={`absolute inset-0 flex items-center justify-center transition ${isExpanded ? "bg-black/50" : "bg-black/0 group-hover:bg-black/40"}`}>
                                                        <div className={`transition ${isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                                                            {isExpanded ? (
                                                                <svg className="h-5 w-5 text-white drop-shadow" fill="currentColor" viewBox="0 0 24 24">
                                                                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                                                </svg>
                                                            ) : (
                                                                <svg className="h-5 w-5 text-white drop-shadow ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                                                    <path d="M8 5v14l11-7z" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Playing indicator bars */}
                                                {isExpanded && (
                                                    <div className="absolute bottom-0.5 left-0.5 right-0.5 flex h-1.5 items-end justify-center gap-[2px]">
                                                        <div className="w-[3px] animate-bounce rounded-full bg-green-400" style={{ animationDelay: "0ms", height: "6px" }} />
                                                        <div className="w-[3px] animate-bounce rounded-full bg-green-400" style={{ animationDelay: "150ms", height: "4px" }} />
                                                        <div className="w-[3px] animate-bounce rounded-full bg-green-400" style={{ animationDelay: "300ms", height: "5px" }} />
                                                    </div>
                                                )}
                                            </button>

                                            {/* Song Info */}
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-gray-100">{song.title}</p>
                                                <p className="truncate text-xs text-gray-400">{song.artist}</p>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex flex-shrink-0 items-center gap-1">
                                                {/* Save to Liked Songs */}
                                                <button
                                                    onClick={() => saveSingleSong(i)}
                                                    disabled={isSaved || isSaving || !song.spotify_uri}
                                                    className={`rounded-lg p-2 transition ${isSaved
                                                        ? "text-green-400"
                                                        : "text-gray-500 hover:bg-green-500/10 hover:text-green-400"
                                                        } disabled:cursor-default`}
                                                    title={isSaved ? "Gespeichert ✓" : "Zu Lieblingssongs hinzufügen"}
                                                >
                                                    {isSaving ? (
                                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
                                                    ) : (
                                                        <svg className="h-5 w-5" fill={isSaved ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                                        </svg>
                                                    )}
                                                </button>

                                                {/* Open in Spotify */}
                                                {song.spotify_url && (
                                                    <a
                                                        href={song.spotify_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="rounded-lg p-2 text-gray-500 transition hover:bg-green-500/10 hover:text-green-400"
                                                        title="Auf Spotify öffnen"
                                                    >
                                                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                                        </svg>
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        {/* Spotify Embed Player */}
                                        {isExpanded && trackId && (
                                            <div
                                                className="border-t border-white/5 bg-black/20"
                                                style={{ animation: "slideDown 200ms ease-out" }}
                                            >
                                                <iframe
                                                    key={`embed-${trackId}-${i}`}
                                                    src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`}
                                                    width="100%"
                                                    height="80"
                                                    frameBorder="0"
                                                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                                    style={{ border: "none", display: "block" }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Skeleton loading */}
                {loading && (
                    <div className="space-y-2">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="glass-light flex animate-pulse items-center gap-3 rounded-xl p-3">
                                <div className="h-14 w-14 rounded-lg bg-gray-700" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-3/4 rounded bg-gray-700" />
                                    <div className="h-3 w-1/2 rounded bg-gray-700" />
                                </div>
                                <div className="h-8 w-8 rounded-lg bg-gray-700" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Sticky bottom bar: Save all */}
                {result && !saveAllResult && (
                    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/5 bg-gray-950/90 px-4 py-3 backdrop-blur-xl">
                        <div className="mx-auto flex max-w-2xl items-center justify-between">
                            <p className="text-sm text-gray-300">
                                <span className="font-bold text-green-400">{result.songs.filter((s) => s.spotify_uri).length}</span> Songs gefunden
                            </p>
                            <button
                                onClick={saveAllSongs}
                                disabled={savingAll}
                                className="flex items-center gap-2 rounded-xl bg-green-500 px-5 py-2.5 text-sm font-bold text-gray-950 transition hover:bg-green-400 disabled:opacity-50"
                            >
                                {savingAll ? (
                                    <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-950 border-t-transparent" />
                                        Speichere…
                                    </>
                                ) : (
                                    "💚 Alle in Lieblingssongs"
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
