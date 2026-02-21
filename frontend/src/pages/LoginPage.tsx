import { useState } from "react";
import { api } from "../lib/api";

export default function LoginPage() {
    const [loading, setLoading] = useState(false);

    const handleSpotifyLogin = async () => {
        setLoading(true);
        try {
            const redirectUri = `${window.location.origin}/callback`;
            const data = await api<{ url: string; redirect_uri: string }>(
                `/auth/login?redirect_uri=${encodeURIComponent(redirectUri)}`
            );
            // Store the redirect_uri the backend resolved so the callback page uses the same one
            sessionStorage.setItem("spotify_redirect_uri", data.redirect_uri);
            window.location.href = data.url;
        } catch {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="glass w-full max-w-md rounded-2xl p-8">
                {/* Logo */}
                <div className="mb-8 text-center">
                    <h1 className="text-4xl font-bold tracking-tight">
                        <span className="text-green-400">Vibe</span>Swipe
                    </h1>
                    <p className="mt-3 text-sm text-gray-400">
                        Discover music you'll love — one swipe at a time.
                    </p>
                </div>

                <button
                    onClick={handleSpotifyLogin}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-green-500 px-4 py-3.5 text-sm font-semibold text-gray-950 transition hover:bg-green-400 disabled:opacity-50"
                >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                    {loading ? "Verbinde mit Spotify…" : "Mit Spotify einloggen"}
                </button>

                <p className="mt-6 text-center text-xs text-gray-500">
                    Dein Spotify-Konto wird verwendet, um dich zu authentifizieren
                    und deine Musikvorlieben zu analysieren.
                </p>
            </div>
        </div>
    );
}
