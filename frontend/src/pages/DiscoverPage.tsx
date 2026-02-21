import { useState, useRef, useEffect } from "react";
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

interface PlaylistResult {
    playlist_url: string;
    playlist_id: string;
    name: string;
    total_tracks: number;
}

export default function DiscoverPage() {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [prompt, setPrompt] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<DiscoverResult | null>(null);
    const [error, setError] = useState("");

    // Like/dislike state
    const [liked, setLiked] = useState<Set<number>>(new Set());
    const [dismissed, setDismissed] = useState<Set<number>>(new Set());

    // Audio preview
    const [playingIdx, setPlayingIdx] = useState<number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Playlist creation
    const [creatingPlaylist, setCreatingPlaylist] = useState(false);
    const [playlistResult, setPlaylistResult] = useState<PlaylistResult | null>(null);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const handleDiscover = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setError("");
        setResult(null);
        setLiked(new Set());
        setDismissed(new Set());
        setPlaylistResult(null);
        setPlayingIdx(null);
        if (audioRef.current) audioRef.current.pause();
        setLoading(true);

        try {
            const data = await api<DiscoverResult>("/discover", {
                method: "POST",
                body: { prompt: prompt.trim() },
                token: token || "",
            });
            setResult(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Etwas ist schiefgelaufen");
        } finally {
            setLoading(false);
        }
    };

    const toggleLike = (idx: number) => {
        setLiked((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) {
                next.delete(idx);
            } else {
                next.add(idx);
                // Remove from dismissed if it was there
                setDismissed((d) => {
                    const nd = new Set(d);
                    nd.delete(idx);
                    return nd;
                });
            }
            return next;
        });
    };

    const toggleDismiss = (idx: number) => {
        setDismissed((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) {
                next.delete(idx);
            } else {
                next.add(idx);
                // Remove from liked if it was there
                setLiked((l) => {
                    const nl = new Set(l);
                    nl.delete(idx);
                    return nl;
                });
            }
            return next;
        });
    };

    const togglePreview = (idx: number, url: string) => {
        if (playingIdx === idx) {
            // Stop
            audioRef.current?.pause();
            setPlayingIdx(null);
            return;
        }

        // Play new
        if (audioRef.current) audioRef.current.pause();
        const audio = new Audio(url);
        audio.volume = 0.5;
        audio.play();
        audio.onended = () => setPlayingIdx(null);
        audioRef.current = audio;
        setPlayingIdx(idx);
    };

    const handleCreatePlaylist = async () => {
        if (!result) return;
        const likedSongs = result.songs.filter((_, i) => liked.has(i));
        const uris = likedSongs
            .map((s) => s.spotify_uri)
            .filter((u): u is string => !!u);

        if (uris.length === 0) {
            setError("Wähle mindestens einen Song aus!");
            return;
        }

        setCreatingPlaylist(true);
        setError("");

        try {
            const data = await api<PlaylistResult>("/create-playlist", {
                method: "POST",
                body: {
                    name: `VibeSwipe – ${result.mood_summary.slice(0, 50)}`,
                    description: `Erstellt mit VibeSwipe AI Discover: "${prompt}"`,
                    track_uris: uris,
                },
                token: token || "",
            });
            setPlaylistResult(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Playlist konnte nicht erstellt werden");
        } finally {
            setCreatingPlaylist(false);
        }
    };

    const likedCount = liked.size;

    return (
        <div className="min-h-screen px-4 py-8">
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
                            placeholder='z.B. "Chill Lo-Fi zum Lernen", "Party Songs wie bei Tomorrowland", "Melancholische Indie Songs für einen Regentag"...'
                            rows={3}
                            className="w-full resize-none bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none"
                        />
                        <div className="mt-3 flex items-center justify-between">
                            <p className="text-xs text-gray-500">
                                Powered by Gemini AI + Spotify
                            </p>
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

                {/* Playlist created success */}
                {playlistResult && (
                    <div className="mb-6 rounded-xl bg-green-500/10 p-4 ring-1 ring-green-500/20">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🎉</span>
                            <div>
                                <p className="text-sm font-semibold text-green-400">
                                    Playlist erstellt! ({playlistResult.total_tracks} Songs)
                                </p>
                                <a
                                    href={playlistResult.playlist_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-green-500 underline underline-offset-2 hover:text-green-300"
                                >
                                    Auf Spotify öffnen →
                                </a>
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

                        {/* Liked counter + Create Playlist button */}
                        <div className="mb-4 flex items-center justify-between">
                            <p className="text-sm text-gray-400">
                                <span className="font-semibold text-green-400">{likedCount}</span> Songs ausgewählt
                            </p>
                            {likedCount > 0 && !playlistResult && (
                                <button
                                    onClick={handleCreatePlaylist}
                                    disabled={creatingPlaylist}
                                    className="flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-gray-950 transition hover:bg-green-400 disabled:opacity-50"
                                >
                                    {creatingPlaylist ? (
                                        <>
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-950 border-t-transparent" />
                                            Erstelle…
                                        </>
                                    ) : (
                                        <>
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                            </svg>
                                            Playlist erstellen
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Song List */}
                        <div className="space-y-2">
                            {result.songs.map((song, i) => {
                                const isLiked = liked.has(i);
                                const isDismissed = dismissed.has(i);
                                const isPlaying = playingIdx === i;

                                return (
                                    <div
                                        key={i}
                                        className={`flex items-center gap-3 rounded-xl p-3 transition-all ${isLiked
                                                ? "bg-green-500/10 ring-1 ring-green-500/30"
                                                : isDismissed
                                                    ? "bg-gray-900/50 opacity-40"
                                                    : "glass-light hover:ring-1 hover:ring-white/10"
                                            }`}
                                    >
                                        {/* Album Art + Preview overlay */}
                                        <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-gray-800">
                                            {song.album_image ? (
                                                <img
                                                    src={song.album_image}
                                                    alt={song.title}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center text-xl text-gray-600">
                                                    🎵
                                                </div>
                                            )}
                                            {/* Preview play/pause overlay */}
                                            {song.preview_url && (
                                                <button
                                                    onClick={() => togglePreview(i, song.preview_url!)}
                                                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition hover:opacity-100"
                                                >
                                                    {isPlaying ? (
                                                        <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M8 5v14l11-7z" />
                                                        </svg>
                                                    )}
                                                </button>
                                            )}
                                            {/* Playing indicator */}
                                            {isPlaying && (
                                                <div className="absolute bottom-0.5 left-0.5 right-0.5 flex h-1.5 items-end justify-center gap-[2px]">
                                                    <div className="w-[3px] animate-bounce rounded-full bg-green-400" style={{ animationDelay: "0ms", height: "6px" }} />
                                                    <div className="w-[3px] animate-bounce rounded-full bg-green-400" style={{ animationDelay: "150ms", height: "4px" }} />
                                                    <div className="w-[3px] animate-bounce rounded-full bg-green-400" style={{ animationDelay: "300ms", height: "5px" }} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Song Info */}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-gray-100">
                                                {song.title}
                                            </p>
                                            <p className="truncate text-xs text-gray-400">
                                                {song.artist}
                                            </p>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex flex-shrink-0 items-center gap-1">
                                            {/* Dislike */}
                                            <button
                                                onClick={() => toggleDismiss(i)}
                                                className={`rounded-lg p-2 transition ${isDismissed
                                                        ? "bg-red-500/20 text-red-400"
                                                        : "text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                                                    }`}
                                                title="Mag ich nicht"
                                            >
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>

                                            {/* Like */}
                                            <button
                                                onClick={() => toggleLike(i)}
                                                className={`rounded-lg p-2 transition ${isLiked
                                                        ? "bg-green-500/20 text-green-400"
                                                        : "text-gray-500 hover:bg-green-500/10 hover:text-green-400"
                                                    }`}
                                                title="Mag ich"
                                            >
                                                <svg className="h-4 w-4" fill={isLiked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                                </svg>
                                            </button>

                                            {/* Spotify Link */}
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
                                <div className="flex gap-1">
                                    <div className="h-8 w-8 rounded-lg bg-gray-700" />
                                    <div className="h-8 w-8 rounded-lg bg-gray-700" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Sticky bottom bar when songs are liked */}
                {result && likedCount > 0 && !playlistResult && (
                    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/5 bg-gray-950/90 px-4 py-3 backdrop-blur-xl">
                        <div className="mx-auto flex max-w-2xl items-center justify-between">
                            <p className="text-sm text-gray-300">
                                <span className="font-bold text-green-400">{likedCount}</span> Song{likedCount !== 1 && "s"} ausgewählt
                            </p>
                            <button
                                onClick={handleCreatePlaylist}
                                disabled={creatingPlaylist}
                                className="flex items-center gap-2 rounded-xl bg-green-500 px-5 py-2.5 text-sm font-bold text-gray-950 transition hover:bg-green-400 disabled:opacity-50"
                            >
                                {creatingPlaylist ? (
                                    <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-950 border-t-transparent" />
                                        Erstelle…
                                    </>
                                ) : (
                                    "🎶 Playlist erstellen"
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
