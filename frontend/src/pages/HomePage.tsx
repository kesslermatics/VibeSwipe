import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface UserProfile {
    spotify_id: string;
    email: string | null;
    display_name: string | null;
}

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
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="glass w-full max-w-lg rounded-2xl p-8">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            <span className="text-green-400">Vibe</span>Swipe
                        </h1>
                        {user && (
                            <p className="mt-1 text-sm text-gray-400">
                                Willkommen, {user.display_name || user.email || user.spotify_id}!
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

                {/* Placeholder content */}
                <div className="glass-light rounded-xl p-6 text-center">
                    <div className="mb-3 text-4xl">🎵</div>
                    <h2 className="text-lg font-semibold text-gray-200">
                        Bereit zum Swipen!
                    </h2>
                    <p className="mt-2 text-sm text-gray-400">
                        Dein Spotify-Konto ist verbunden. Hier werden bald Songs
                        zum Swipen angezeigt.
                    </p>
                </div>
            </div>
        </div>
    );
}
