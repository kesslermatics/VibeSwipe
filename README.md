# 🎵 SpotiVibe

A fullstack web application for discovering music through a swipe-based interface, powered by Spotify.

## Tech Stack

| Layer    | Technology                                  |
| -------- | ------------------------------------------- |
| Frontend | React · TypeScript · Vite · Tailwind CSS v4 |
| Backend  | Python · FastAPI · SQLAlchemy · PostgreSQL   |
| Auth     | JWT (python-jose + passlib/bcrypt)           |

## Project Structure

```
VibeSwipe/
├── frontend/          # React + Vite SPA
│   ├── src/
│   │   ├── lib/       # API helper
│   │   ├── pages/     # LoginPage, RegisterPage, SettingsPage
│   │   ├── App.tsx    # Router setup
│   │   └── index.css  # Tailwind + Glassmorphism styles
│   └── ...
├── backend/           # FastAPI REST API
│   ├── app/
│   │   ├── main.py    # App entrypoint + CORS
│   │   ├── routes.py  # /login, /register, /settings/spotify-key
│   │   ├── models.py  # SQLAlchemy User model
│   │   ├── schemas.py # Pydantic request/response schemas
│   │   ├── auth.py    # JWT + password hashing
│   │   ├── database.py# DB session + engine
│   │   └── config.py  # Settings from .env
│   └── requirements.txt
└── .gitignore
```

## Getting Started

### Prerequisites

- Node.js ≥ 18
- Python ≥ 3.11
- PostgreSQL

### 1. Clone & Configure

```bash
git clone https://github.com/kesslermatics/VibeSwipe.git
cd VibeSwipe

# Backend env
cp backend/.env.example backend/.env
# Edit backend/.env with your DB credentials & secret key

# Frontend env (optional)
cp frontend/.env.example frontend/.env
```

### 2. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`. Docs at `/docs`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173`. The Vite dev server proxies `/api/*` to the backend.

## API Endpoints

| Method | Endpoint                 | Auth     | Description              |
| ------ | ------------------------ | -------- | ------------------------ |
| POST   | `/register`              | –        | Create a new account     |
| POST   | `/login`                 | –        | Get a JWT access token   |
| POST   | `/settings/spotify-key`  | Bearer   | Save Spotify API key     |
| GET    | `/health`                | –        | Health check             |

## License

Open Source – see [LICENSE](LICENSE) for details.
