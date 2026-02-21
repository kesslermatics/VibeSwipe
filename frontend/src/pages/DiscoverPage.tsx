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

export default function DiscoverPage() {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [prompt, setPrompt] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<DiscoverResult | null>(null);
    const [error, setError] = useState("");

    const handleDiscover = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setError("");
        setResult(null);
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

                {/* Results */}
                {result && (
                    <div>
                        {/* Mood Summary */}
                        <div className="mb-6 rounded-xl bg-green-500/10 px-4 py-3 text-sm text-green-400 ring-1 ring-green-500/20">
                            🎯 {result.mood_summary}
                        </div>

                        {/* Song List */}
                        <div className="space-y-3">
                            {result.songs.map((song, i) => (
                                <div
                                    key={i}
                                    className="glass-light flex items-center gap-4 rounded-xl p-3 transition hover:ring-1 hover:ring-green-500/30"
                                >
                                    {/* Album Art */}
                                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-gray-800">
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

                                    {/* Spotify Link */}
                                    {song.spotify_url && (
                                        <a
                                            href={song.spotify_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex-shrink-0 rounded-lg p-2 text-green-400 transition hover:bg-green-500/10"
                                            title="Auf Spotify öffnen"
                                        >
                                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                            </svg>
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty state while loading */}
                {loading && (
                    <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="glass-light flex animate-pulse items-center gap-4 rounded-xl p-3">
                                <div className="h-14 w-14 rounded-lg bg-gray-700" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-3/4 rounded bg-gray-700" />
                                    <div className="h-3 w-1/2 rounded bg-gray-700" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
