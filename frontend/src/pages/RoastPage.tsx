import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getRoast, type RoastResult } from "../lib/api";

const FEATURE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
    danceability: { label: "Danceability", emoji: "💃", color: "bg-pink-500" },
    energy: { label: "Energy", emoji: "⚡", color: "bg-yellow-500" },
    valence: { label: "Happiness", emoji: "😊", color: "bg-green-500" },
    acousticness: { label: "Acoustic", emoji: "🎸", color: "bg-amber-500" },
    instrumentalness: { label: "Instrumental", emoji: "🎹", color: "bg-blue-500" },
    speechiness: { label: "Speechiness", emoji: "🗣️", color: "bg-violet-500" },
};

export default function RoastPage({ onLogout: _onLogout }: { onLogout: () => void }) {
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState<RoastResult | null>(null);

    const handleGenerate = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await getRoast();
            setResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error generating roast");
        } finally {
            setLoading(false);
        }
    }, []);

    return (
        <div className="min-h-screen px-4 py-8">
            <div className="mx-auto max-w-md">
                {/* Header */}
                <div className="mb-6 flex items-center gap-4">
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
                            <span className="text-orange-400">Vibe</span>{" "}
                            <span className="text-gray-100">Roast</span>
                        </h1>
                        <p className="text-sm text-gray-400">
                            Your AI-generated music profile
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 ring-1 ring-red-500/20">
                        {error}
                    </div>
                )}

                {/* ── Intro ── */}
                {!result && !loading && (
                    <div className="flex flex-col items-center py-16">
                        <div className="mb-6 text-7xl">🔥</div>
                        <h2 className="mb-3 text-xl font-bold text-gray-100">
                            Ready for the truth?
                        </h2>
                        <p className="mb-8 max-w-xs text-center text-sm text-gray-400">
                            AI analyzes your top 50 songs &amp; artists, calculates your
                            audio profile and serves you a merciless roast.
                        </p>
                        <button
                            onClick={handleGenerate}
                            className="rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-110"
                        >
                            🔥 Roast me!
                        </button>
                    </div>
                )}

                {/* ── Loading ── */}
                {loading && (
                    <div className="flex flex-col items-center py-16">
                        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
                        <p className="text-sm text-gray-400">
                            AI is analyzing your listening habits...
                        </p>
                        <p className="mt-1 text-xs text-gray-600">
                            This may take 10–20 seconds
                        </p>
                    </div>
                )}

                {/* ── Result Card ── */}
                {result && !loading && (
                    <div className="space-y-6">
                        {/* Persona card */}
                        <div className="rounded-3xl bg-gradient-to-br from-orange-500/20 via-red-500/10 to-purple-500/20 p-6 ring-1 ring-white/10 shadow-2xl">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-orange-400/70">
                                Your Music Type
                            </p>
                            <h2 className="mb-4 text-3xl font-black leading-tight text-gray-100">
                                {result.persona}
                            </h2>

                            {/* Roast text */}
                            <div className="rounded-2xl bg-black/30 px-5 py-4">
                                <p className="text-sm leading-relaxed text-gray-300 italic">
                                    "{result.roast}"
                                </p>
                            </div>
                        </div>

                        {/* Audio Features */}
                        <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-400">
                                Audio DNA
                            </h3>
                            <div className="space-y-3">
                                {Object.entries(FEATURE_LABELS).map(([key, meta]) => {
                                    const value = result.audio_features[key as keyof typeof result.audio_features];
                                    if (value === undefined || key === "tempo") return null;
                                    const pct = Math.round(value * 100);
                                    return (
                                        <div key={key}>
                                            <div className="mb-1 flex items-center justify-between text-xs">
                                                <span className="text-gray-400">
                                                    {meta.emoji} {meta.label}
                                                </span>
                                                <span className="font-bold text-gray-300">
                                                    {pct}%
                                                </span>
                                            </div>
                                            <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                                                <div
                                                    className={`h-full rounded-full ${meta.color} transition-all duration-700`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Tempo */}
                                {result.audio_features.tempo > 0 && (
                                    <div className="mt-2 flex items-center justify-between rounded-xl bg-white/5 px-4 py-2 text-xs">
                                        <span className="text-gray-400">🥁 Tempo</span>
                                        <span className="font-bold text-gray-300">
                                            {Math.round(result.audio_features.tempo)} BPM
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Top Genres */}
                        {result.top_genres.length > 0 && (
                            <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-400">
                                    Top Genres
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {result.top_genres.map((genre, i) => (
                                        <span
                                            key={genre}
                                            className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-300 ring-1 ring-orange-500/20"
                                        >
                                            {i === 0 && "👑 "}
                                            {genre}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Top Artists */}
                        {result.top_artists.length > 0 && (
                            <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-400">
                                    Top Artists
                                </h3>
                                <div className="space-y-2">
                                    {result.top_artists.slice(0, 10).map((artist, i) => (
                                        <div
                                            key={artist}
                                            className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
                                        >
                                            <span className="w-5 text-right text-xs font-bold text-gray-500">
                                                {i + 1}
                                            </span>
                                            <span className="text-sm text-gray-300">{artist}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Stats bar */}
                        <div className="flex justify-center gap-4 text-center text-xs text-gray-500">
                            <div className="rounded-xl bg-white/5 px-4 py-2 ring-1 ring-white/5">
                                <span className="text-lg font-bold text-gray-300">
                                    {result.track_count}
                                </span>
                                <p>Songs analyzed</p>
                            </div>
                            <div className="rounded-xl bg-white/5 px-4 py-2 ring-1 ring-white/5">
                                <span className="text-lg font-bold text-gray-300">
                                    {result.top_genres.length}
                                </span>
                                <p>Genres</p>
                            </div>
                            <div className="rounded-xl bg-white/5 px-4 py-2 ring-1 ring-white/5">
                                <span className="text-lg font-bold text-gray-300">
                                    {result.top_artists.length}
                                </span>
                                <p>Artists</p>
                            </div>
                        </div>

                        {/* Regenerate button */}
                        <div className="flex flex-col items-center py-4">
                            <button
                                onClick={handleGenerate}
                                disabled={loading}
                                className="rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-110 disabled:opacity-50"
                            >
                                🔄 Roast me again!
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
