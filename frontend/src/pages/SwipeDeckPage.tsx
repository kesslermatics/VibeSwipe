import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useMotionValue, useTransform, animate, type PanInfo } from "framer-motion";
import { getSwipeDeck, saveTrack, getUserPlaylists, type SwipeTrack } from "../lib/api";

interface Playlist {
    id: string;
    name: string;
    image: string | null;
    total_tracks: number;
    owner: string;
}

type Phase = "pick-playlist" | "loading" | "swiping" | "empty";

export default function SwipeDeckPage({ onLogout: _onLogout }: { onLogout: () => void }) {
    const navigate = useNavigate();

    const [phase, setPhase] = useState<Phase>("pick-playlist");
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [playlistsLoading, setPlaylistsLoading] = useState(true);
    const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
    const [deck, setDeck] = useState<SwipeTrack[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [error, setError] = useState("");
    const [swipeLabel, setSwipeLabel] = useState<"like" | "nope" | null>(null);
    const [savedCount, setSavedCount] = useState(0);
    const [skippedCount, setSkippedCount] = useState(0);

    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Load user playlists on mount
    useEffect(() => {
        getUserPlaylists()
            .then((p) => setPlaylists(p as Playlist[]))
            .catch((err) => setError(err instanceof Error ? err.message : "Playlists laden fehlgeschlagen"))
            .finally(() => setPlaylistsLoading(false));
    }, []);

    const currentTrack = deck[currentIndex] ?? null;
    const nextTrack = deck[currentIndex + 1] ?? null;

    // Load deck from selected playlist
    const loadDeck = useCallback(async (playlist: Playlist) => {
        setPhase("loading");
        setError("");
        setSelectedPlaylist(playlist);
        setSavedCount(0);
        setSkippedCount(0);
        try {
            const tracks = await getSwipeDeck(playlist.id);
            if (tracks.length === 0) {
                setError("Keine passenden Songs mit Preview gefunden. Versuch eine andere Playlist!");
                setPhase("pick-playlist");
                return;
            }
            setDeck(tracks);
            setCurrentIndex(0);
            setPhase("swiping");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fehler beim Laden");
            setPhase("pick-playlist");
        }
    }, []);

    // Play audio when current track changes
    useEffect(() => {
        if (phase !== "swiping" || !currentTrack) return;
        const audio = audioRef.current;
        if (!audio) return;
        audio.src = currentTrack.preview_url;
        audio.load();
        audio.play().catch(() => { /* autoplay blocked */ });
        return () => {
            audio.pause();
        };
    }, [currentIndex, phase, currentTrack]);

    const advanceCard = useCallback(
        async (direction: "left" | "right") => {
            if (!currentTrack || !selectedPlaylist) return;

            if (direction === "right") {
                try {
                    await saveTrack(currentTrack.id, selectedPlaylist.id);
                    setSavedCount((c) => c + 1);
                } catch {
                    /* silent fail */
                }
            } else {
                setSkippedCount((c) => c + 1);
            }

            setSwipeLabel(null);

            if (currentIndex + 1 >= deck.length) {
                setPhase("empty");
            } else {
                setCurrentIndex((i) => i + 1);
            }
        },
        [currentTrack, currentIndex, deck.length, selectedPlaylist]
    );

    return (
        <div className="min-h-screen px-4 py-8">
            <div className="mx-auto max-w-md">
                {/* Header */}
                <div className="mb-6 flex items-center gap-4">
                    <button
                        onClick={() => phase === "swiping" ? setPhase("pick-playlist") : navigate("/")}
                        className="rounded-lg p-2 text-gray-400 ring-1 ring-white/10 transition hover:text-white hover:ring-white/20"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold tracking-tight">
                            <span className="text-purple-400">Swipe</span>{" "}
                            <span className="text-gray-100">Deck</span>
                        </h1>
                        <p className="text-sm text-gray-400">
                            {phase === "pick-playlist"
                                ? "Wähle eine Playlist als Basis"
                                : selectedPlaylist
                                    ? `Basierend auf: ${selectedPlaylist.name}`
                                    : "Swipe rechts zum Hinzufügen"
                            }
                        </p>
                    </div>
                    {phase === "swiping" && (
                        <div className="flex gap-3 text-xs text-gray-500">
                            <span className="text-green-400">💚 {savedCount}</span>
                            <span className="text-red-400">❌ {skippedCount}</span>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="mb-6 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 ring-1 ring-red-500/20">
                        {error}
                    </div>
                )}

                {/* Hidden audio element */}
                <audio ref={audioRef} />

                {/* ── PICK PLAYLIST ── */}
                {phase === "pick-playlist" && (
                    <div>
                        <div className="mb-4 flex items-center gap-2">
                            <span className="text-2xl">💿</span>
                            <p className="text-sm text-gray-400">
                                AI analysiert die Playlist und schlägt passende neue Songs vor.
                                Rechts-Swipe fügt Songs direkt zur Playlist hinzu!
                            </p>
                        </div>

                        {playlistsLoading ? (
                            <div className="flex flex-col items-center py-16">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
                                <p className="mt-3 text-sm text-gray-500">Lade Playlists...</p>
                            </div>
                        ) : playlists.length === 0 ? (
                            <p className="py-8 text-center text-sm text-gray-500">
                                Keine Playlists gefunden. Erstelle zuerst eine Playlist auf Spotify!
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {playlists.map((pl) => (
                                    <button
                                        key={pl.id}
                                        onClick={() => loadDeck(pl)}
                                        className="flex w-full items-center gap-4 rounded-2xl bg-white/5 p-3 text-left ring-1 ring-white/5 transition hover:bg-white/10 hover:ring-purple-500/30"
                                    >
                                        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-gray-800">
                                            {pl.image ? (
                                                <img src={pl.image} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center text-xl text-gray-600">🎵</div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-gray-200">{pl.name}</p>
                                            <p className="text-xs text-gray-500">{pl.total_tracks} Songs · {pl.owner}</p>
                                        </div>
                                        <svg className="h-4 w-4 flex-shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── LOADING ── */}
                {phase === "loading" && (
                    <div className="flex flex-col items-center py-16">
                        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
                        <p className="text-sm text-gray-400">AI analysiert die Playlist...</p>
                        <p className="mt-1 text-xs text-gray-600">
                            Das kann 15–30 Sekunden dauern
                        </p>
                    </div>
                )}

                {/* ── SWIPING ── */}
                {phase === "swiping" && currentTrack && (
                    <div className="relative flex flex-col items-center">
                        {/* Card stack */}
                        <div className="relative h-[480px] w-full max-w-[340px]">
                            {/* Next card (behind) */}
                            {nextTrack && (
                                <div className="absolute inset-0 z-0 scale-[0.95] rounded-3xl bg-white/5 ring-1 ring-white/10 overflow-hidden opacity-60">
                                    <div className="h-[340px] bg-gray-800">
                                        {nextTrack.album_image && (
                                            <img src={nextTrack.album_image} alt="" className="h-full w-full object-cover opacity-50" />
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Current card (swipeable) */}
                            <SwipeCard
                                key={currentTrack.id}
                                track={currentTrack}
                                onSwipe={advanceCard}
                                onDragLabel={setSwipeLabel}
                            />

                            {/* Swipe label overlays */}
                            {swipeLabel === "like" && (
                                <div className="pointer-events-none absolute left-6 top-8 z-30 rounded-lg border-4 border-green-400 px-4 py-2 text-2xl font-black uppercase text-green-400 -rotate-12">
                                    LIKE
                                </div>
                            )}
                            {swipeLabel === "nope" && (
                                <div className="pointer-events-none absolute right-6 top-8 z-30 rounded-lg border-4 border-red-400 px-4 py-2 text-2xl font-black uppercase text-red-400 rotate-12">
                                    NOPE
                                </div>
                            )}
                        </div>

                        {/* Progress */}
                        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                            <span>{currentIndex + 1} / {deck.length}</span>
                            <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
                                <div
                                    className="h-full rounded-full bg-purple-500 transition-all"
                                    style={{ width: `${((currentIndex + 1) / deck.length) * 100}%` }}
                                />
                            </div>
                        </div>

                        {/* Quick action buttons */}
                        <div className="mt-6 flex gap-6">
                            <button
                                onClick={() => advanceCard("left")}
                                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/30 transition hover:bg-red-500/20"
                            >
                                <span className="text-xl">❌</span>
                            </button>
                            <button
                                onClick={() => advanceCard("right")}
                                className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/30 transition hover:bg-green-500/20"
                            >
                                <span className="text-xl">💚</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* ── EMPTY ── */}
                {phase === "empty" && (
                    <div className="flex flex-col items-center py-16">
                        <div className="mb-6 text-6xl">🎉</div>
                        <h2 className="mb-2 text-xl font-bold text-gray-100">
                            Alle Songs durchgeswipt!
                        </h2>
                        {selectedPlaylist && (
                            <p className="mb-4 text-sm text-gray-400">
                                {savedCount} Songs zu <span className="font-semibold text-purple-400">{selectedPlaylist.name}</span> hinzugefügt
                            </p>
                        )}
                        <div className="mb-6 flex gap-6 text-center">
                            <div className="rounded-xl bg-green-500/10 px-5 py-3 ring-1 ring-green-500/20">
                                <p className="text-2xl font-bold text-green-400">{savedCount}</p>
                                <p className="text-[10px] text-gray-400">Hinzugefügt</p>
                            </div>
                            <div className="rounded-xl bg-red-500/10 px-5 py-3 ring-1 ring-red-500/20">
                                <p className="text-2xl font-bold text-red-400">{skippedCount}</p>
                                <p className="text-[10px] text-gray-400">Geskippt</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => selectedPlaylist && loadDeck(selectedPlaylist)}
                                className="rounded-2xl bg-gradient-to-r from-purple-500 to-violet-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/25 transition hover:brightness-110"
                            >
                                🔄 Nochmal
                            </button>
                            <button
                                onClick={() => { setPhase("pick-playlist"); setError(""); }}
                                className="rounded-2xl px-6 py-3 text-sm font-bold text-gray-300 ring-1 ring-white/10 transition hover:ring-white/20"
                            >
                                Andere Playlist
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Swipeable Card Component ─────────────────────────
function SwipeCard({
    track,
    onSwipe,
    onDragLabel,
}: {
    track: SwipeTrack;
    onSwipe: (dir: "left" | "right") => void;
    onDragLabel: (label: "like" | "nope" | null) => void;
}) {
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-200, 200], [-18, 18]);
    const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);

    const handleDrag = (_: unknown, info: PanInfo) => {
        if (info.offset.x > 60) {
            onDragLabel("like");
        } else if (info.offset.x < -60) {
            onDragLabel("nope");
        } else {
            onDragLabel(null);
        }
    };

    const handleDragEnd = (_: unknown, info: PanInfo) => {
        const threshold = 100;
        if (info.offset.x > threshold) {
            // Animate off-screen right
            animate(x, 500, { duration: 0.3 });
            setTimeout(() => onSwipe("right"), 200);
        } else if (info.offset.x < -threshold) {
            // Animate off-screen left
            animate(x, -500, { duration: 0.3 });
            setTimeout(() => onSwipe("left"), 200);
        } else {
            // Snap back
            animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
            onDragLabel(null);
        }
    };

    return (
        <motion.div
            className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing"
            style={{ x, rotate, opacity }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.9}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
        >
            <div className="h-full w-full overflow-hidden rounded-3xl bg-gray-900 shadow-2xl ring-1 ring-white/10">
                {/* Album art */}
                <div className="relative h-[340px] w-full overflow-hidden bg-gray-800">
                    {track.album_image ? (
                        <img
                            src={track.album_image}
                            alt={track.album}
                            className="h-full w-full object-cover"
                            draggable={false}
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-6xl text-gray-600">
                            🎵
                        </div>
                    )}
                    {/* Gradient overlay at bottom */}
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-gray-900 to-transparent" />
                </div>

                {/* Track info */}
                <div className="px-6 py-5">
                    <h3 className="truncate text-lg font-bold text-gray-100">
                        {track.title}
                    </h3>
                    <p className="truncate text-sm text-gray-400">{track.artist}</p>
                    <p className="mt-1 truncate text-xs text-gray-600">{track.album}</p>

                    {/* Audio visualizer bar (fake) */}
                    <div className="mt-3 flex items-center gap-1">
                        {Array.from({ length: 20 }).map((_, i) => (
                            <div
                                key={i}
                                className="w-1 animate-pulse rounded-full bg-purple-500/60"
                                style={{
                                    height: `${Math.random() * 16 + 4}px`,
                                    animationDelay: `${i * 0.05}s`,
                                }}
                            />
                        ))}
                        <span className="ml-auto text-[10px] text-gray-500">30s Preview</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
