# The Trial

A browser card game with a Node backend for sessions, guest accounts, usernames, leaderboards, and server-authoritative game sessions.

## What Changed

- The frontend now talks to `/api/v1/*` instead of `localStorage`.
- Guest login is functional immediately with an automatic username like `guest0001`.
- Google login uses a real OAuth redirect flow once you provide credentials.
- Leaderboards are stored on the server.
- Game sessions are created and resolved on the server, so leaderboard updates no longer come from raw client-side counter increments.
- Only Google users can choose a custom username.

## Local Run

1. Make sure you have Node 24+ and `pnpm`.
2. If you use Corepack, enable it once:

```bash
corepack enable
```

3. Copy `.env.example` to `.env` or set the same environment variables in your shell.
4. From the project root, install and run with `pnpm`:

```bash
pnpm install
pnpm start
```

`pnpm start` now loads environment variables from `.env` automatically.

5. Optional syntax check:

```bash
pnpm check
```

6. Open:

- `http://localhost:3000`

The backend serves the static frontend and the API from the same origin in local development.

This repo is a single package, so it does not need `pnpm-workspace.yaml`.

## Required Environment Variables

For local guest-only testing:

- `APP_ORIGIN`
- `DATABASE_PATH`

For Google sign-in:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

## API Surface

- `GET /api/v1/auth/session`
- `POST /api/v1/auth/guest`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/google/start-url`
- `PUT /api/v1/profile/username`
- `GET /api/v1/profile/username-availability`
- `POST /api/v1/profile/touch`
- `GET /api/v1/leaderboards`
- `POST /api/v1/games`
- `POST /api/v1/games/:id/guess`

## Netlify Deployment

Netlify can host the static frontend, but not this long-running Node server directly.

Use one of these deployment shapes:

1. Host the backend on a real Node host such as Render, Railway, Fly.io, or a VM.
2. Host the frontend on Netlify.
3. Add a proxy so the frontend still calls `/api/*` on the same site.

A starter proxy file is included as `netlify.example.toml`. Copy it to `netlify.toml` and replace `https://your-backend-host.example.com` with your backend origin.

## Notes

- The SQLite database is created under `data/` at runtime.
- Google login will not work until the provider credentials and callback URLs are configured correctly.
- The legacy CLI prototype is still available in `card_game.py`.
