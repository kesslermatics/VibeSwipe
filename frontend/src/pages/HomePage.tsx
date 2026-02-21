import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface UserProfile {
    spotify_id: string;
    email: string | null;
    display_name: string | null;
}

interface Tile {
    id: string;
    emoji: string;
    title: string;
    description: string;
    color: string;
    route: string;
}

const tiles: Tile[] = [
    {
        id: "discover",
        emoji: "🔮",
        title: "Discover",
        description: "Beschreibe deine Stimmung und entdecke Songs per AI",
        color: "from-green-500/20 to-emerald-500/10 hover:ring-green-500/40",
        route: "/discover",
    },
    {
        id: "swipe",
        emoji: "💿",
        title: "Swipe",
        description: "Swipe durch Song-Vorschläge — links oder rechts",
        color: "from-purple-500/20 to-violet-500/10 hover:ring-purple-500/40",
        route: "/",
    },
    {
        id: "playlists",
        emoji: "📋",
        title: "Playlists",
        description: "Deine gespeicherten Playlists und Favoriten",
        color: "from-sky-500/20 to-blue-500/10 hover:ring-sky-500/40",
        route: "/",
    },
];

export default function HomePage() {
    const navigate = useNavigate();
    const [user, setUser] = useState<UserProfile | null>(null);
    const token = localStorage.getItem("token");

    useEffect(() => {
        if (!token) {
            navigate("/login");
            return;
        }

        api<UserProfile>("/me", { token })
            .then(setUser)
            .catch(() => {
                localStorage.removeItem("token");
                navigate("/login");
            });
    }, [token, navigate]);

    const handleLogout = () => {
        localStorage.removeItem("token");
        navigate("/login");
    };

    return (
        <div className="min-h-screen px-4 py-8">
            <div className="mx-auto max-w-2xl">
                {/* Header */}
                <div className="mb-10 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            <span className="text-green-400">Vibe</span>Swipe
                        </h1>
                        {user && (
                            <p className="mt-1 text-sm text-gray-400">
                                Hey, {user.display_name || user.spotify_id} 👋
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleLogout}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 ring-1 ring-white/10 transition hover:text-white hover:ring-white/20"
                    >
                        Logout
                    </button>
                </div>

                {/* Feature Tiles */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {tiles.map((tile) => {
                        const isAvailable = tile.id === "discover";
                        return (
                            <button
                                key={tile.id}
                                onClick={() => isAvailable && navigate(tile.route)}
                                className={`glass group relative cursor-pointer rounded-2xl bg-gradient-to-br p-6 text-left ring-1 ring-white/10 transition-all ${tile.color} ${!isAvailable ? "opacity-50 cursor-not-allowed" : ""
                                    }`}
                                disabled={!isAvailable}
                            >
                                <div className="mb-4 text-4xl">{tile.emoji}</div>
                                <h2 className="text-lg font-semibold text-gray-100">
                                    {tile.title}
                                </h2>
                                <p className="mt-1 text-sm text-gray-400">
                                    {tile.description}
                                </p>
                                {!isAvailable && (
                                    <span className="absolute right-4 top-4 rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                                        Bald
                                    </span>
                                )}
                                {isAvailable && (
                                    <div className="absolute right-4 top-4 rounded-full p-1.5 text-gray-500 transition group-hover:text-green-400">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
