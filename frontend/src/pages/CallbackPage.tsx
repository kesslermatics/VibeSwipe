import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export default function CallbackPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [error, setError] = useState("");
    const calledRef = useRef(false);

    useEffect(() => {
        // Prevent double-fire (React StrictMode or re-render)
        if (calledRef.current) return;
        calledRef.current = true;

        const code = searchParams.get("code");
        const spotifyError = searchParams.get("error");

        if (spotifyError) {
            setError("Spotify login was cancelled.");
            return;
        }

        if (!code) {
            setError("No authorization code received.");
            return;
        }

        // Exchange the code for our JWT
        const redirectUri =
            sessionStorage.getItem("spotify_redirect_uri") ||
            `${window.location.origin}/callback`;
        api<{ access_token: string }>("/auth/callback", {
            method: "POST",
            body: { code, redirect_uri: redirectUri },
        })
            .then((data) => {
                localStorage.setItem("token", data.access_token);
                // Force full reload so App re-reads the token
                window.location.replace("/");
            })
            .catch((err) => {
                setError(err instanceof Error ? err.message : "Login failed");
            });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="glass w-full max-w-md rounded-2xl p-8 text-center">
                {error ? (
                    <>
                        <div className="mb-4 text-4xl">😕</div>
                        <h2 className="text-xl font-bold text-red-400">Error</h2>
                        <p className="mt-2 text-sm text-gray-400">{error}</p>
                        <button
                            onClick={() => navigate("/login")}
                            className="mt-6 rounded-xl bg-green-500 px-6 py-3 text-sm font-semibold text-gray-950 transition hover:bg-green-400"
                        >
                            Back to Login
                        </button>
                    </>
                ) : (
                    <>
                        <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
                        <p className="text-sm text-gray-400">
                            Connecting to Spotify…
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
