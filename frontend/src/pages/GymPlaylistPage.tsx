import React, { useState } from "react";
import { getUserPlaylists, createGymPlaylist } from "../lib/api";

const GymPlaylistPage: React.FC = () => {
    const [playlists, setPlaylists] = useState<any[]>([]);
    const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    React.useEffect(() => {
        getUserPlaylists().then(setPlaylists);
    }, []);

    const handleSelect = (id: string) => {
        setSelectedPlaylists((prev) =>
            prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
        );
    };

    const handleCreate = async () => {
        setLoading(true);
        setResult(null);
        try {
            const res = await createGymPlaylist(selectedPlaylists);
            setResult(res.message || "Playlist erstellt!");
        } catch (e: any) {
            setResult(e.message || "Fehler beim Erstellen der Playlist.");
        }
        setLoading(false);
    };

    return (
        <div className="gym-playlist-page">
            <h1>Gym Playlist erstellen</h1>
            <p>Wähle mehrere deiner Playlists als Inspiration:</p>
            <div className="playlist-list">
                {playlists.map((pl) => (
                    <label key={pl.id}>
                        <input
                            type="checkbox"
                            checked={selectedPlaylists.includes(pl.id)}
                            onChange={() => handleSelect(pl.id)}
                        />
                        {pl.name}
                    </label>
                ))}
            </div>
            <button onClick={handleCreate} disabled={loading || selectedPlaylists.length === 0}>
                {loading ? "Erstelle..." : "Erstellen"}
            </button>
            {result && <div className="result">{result}</div>}
        </div>
    );
};

export default GymPlaylistPage;
