import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function SettingsPage() {
    const navigate = useNavigate();
    const [spotifyKey, setSpotifyKey] = useState("");
    const [success, setSuccess] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const token = localStorage.getItem("token");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setLoading(true);

        if (!token) {
            navigate("/login");
            return;
        }

        try {
            await api("/settings/spotify-key", {
                method: "POST",
                body: { spotify_api_key: spotifyKey },
                token,
            });
            setSuccess("Spotify API Key saved successfully!");
            setSpotifyKey("");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to save key");
        } finally {
            setLoading(false);
        }
    };

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
                            <span className="text-green-400">Settings</span>
                        </h1>
                        <p className="mt-1 text-sm text-gray-400">
                            Connect your Spotify account
                        </p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 ring-1 ring-white/10 transition hover:text-white hover:ring-white/20"
                    >
                        Logout
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                        <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 ring-1 ring-red-500/20">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400 ring-1 ring-green-500/20">
                            {success}
                        </div>
                    )}

                    <div>
                        <label
                            htmlFor="spotifyKey"
                            className="mb-1.5 block text-sm font-medium text-gray-300"
                        >
                            Spotify API Key
                        </label>
                        <input
                            id="spotifyKey"
                            type="password"
                            required
                            value={spotifyKey}
                            onChange={(e) => setSpotifyKey(e.target.value)}
                            className="glass-light w-full rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 outline-none ring-1 ring-white/10 transition focus:ring-green-500/50"
                            placeholder="Enter your Spotify API Key"
                        />
                        <p className="mt-2 text-xs text-gray-500">
                            You can find your API key in your{" "}
                            <a
                                href="https://developer.spotify.com/dashboard"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-400 hover:text-green-300"
                            >
                                Spotify Developer Dashboard
                            </a>
                            .
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-green-500 px-4 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400 disabled:opacity-50"
                    >
                        {loading ? "Saving…" : "Save API Key"}
                    </button>
                </form>
            </div>
        </div>
    );
}
