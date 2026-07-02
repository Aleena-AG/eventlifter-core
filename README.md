# Ewentcast — Channel Manager

Create an event once, publish it to **HighTribe**, **Eventbrite**, and **Luma**, and keep bookings in one place. Shared capacity sync helps you list everywhere without double-selling the same seat.

Public marketing site lives at `/`. The signed-in app (dashboard, events, bookings, settings) lives behind Ewentcast account login (email/password, plus HighTribe connect).

## Features

- **Multi-channel publish** — create/sync events across HighTribe, Luma, and Eventbrite
- **Ewentcast accounts** — email/password signup & login, password reset via email, subscriptions
- **Unified dashboard** — events, tickets sold, bookings, and recent activity per channel
- **Bookings list** — attendees from API sync and inbound webhooks, deduped by email
- **MySQL-backed API** — per-user settings, channel data, and the cross-channel registry are stored in MySQL and served by a dedicated Express API
- **Webhooks** — Eventbrite, Luma, and HighTribe booking webhooks update the registry and bookings table in real time
- **Capacity sync** — when a ticket sells on one channel, remaining capacity can be pushed to linked channels

## Architecture

This app runs as **two processes**:

| Process | What it is | Port | Owns |
|---------|-----------|------|------|
| **web** | Next.js 16 (App Router) — pages + a thin `app/api/*` layer | `3000` | UI, and proxying requests to the API |
| **api** | Express (`backend/src`) — the real REST API | `4000` (`BACKEND_PORT`) | Auth/sessions, per-user settings, per-user channel event/booking caches, the cross-channel event registry — all in **MySQL** |

Most of the Next.js `app/api/*` routes are thin reverse proxies that forward requests (with the `Authorization` header) to the Express API via `getBackendUrl()` (`src/lib/backend-client.ts`) and relay the JSON response. The exceptions are the routes that talk directly to third-party providers:

- `api/hightribe/[...path]`, `api/luma/[...path]`, `api/eventbrite/[...path]` — direct proxies to the external channel APIs
- `api/webhooks/*` — inbound webhook receivers + `api/webhooks/setup` (registers webhooks with Luma/Eventbrite)
- `api/settings` — hybrid: proxies to the Express API (MySQL, per-user) when an `Authorization` header is present, otherwise falls back to a local `settings.json` file (`src/lib/settings-store.ts`)

Both processes are started together by `concurrently` under `npm run dev` / `npm run start`.

> **Legacy note:** `src/lib/db.ts` (better-sqlite3, `data/eventlifter.db`) and `data/event-registry.json` are leftovers from before the MySQL migration. `db.ts` is no longer imported anywhere; `event-registry.json` is only read once, to seed MySQL if `master_events` is empty on a fresh DB.

## Tech stack

| Layer | Choice |
|--------|--------|
| Web app | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, warm Ewentcast theme |
| API | Express 4 (`backend/`), run via `tsx` (no separate build step) |
| Database | **MySQL** (`mysql2`) — schema managed by `backend/src/db/migrations/*.sql` |
| Auth | Ewentcast email/password sessions (Bearer token) issued by the Express API, plus a linked HighTribe connection per user |
| Email | Nodemailer (SMTP) for password-reset emails, with a dev fallback that exposes the reset link directly |

## Project layout

```
src/
  app/
    page.tsx                 Public landing page
    login/, signup/           Ewentcast auth
    forgot-password/, reset-password/
    subscribe/                Subscription flow
    dashboard/                Main dashboard (after login)
    events/                   Events per channel
    bookings/                 All bookings
    channels/                 Connection status
    settings/                 API keys, tokens, webhook secret
    create/                   Ewentcast event wizard
    api/
      auth/[...path]          Proxy to Express /api/auth/*
      health, db-health       Backend health checks
      events/[channel]        Proxy to Express /api/events/:channel
      events/[channel]/sync            Proxy — upsert channel events
      events/[channel]/sync-bookings   Proxy — upsert channel bookings
      events/bookings         Proxy — all channels' bookings for the user
      registry                Proxy to Express /api/registry
      settings, settings/[channel]     Hybrid: Express proxy (auth'd) or settings.json fallback
      hightribe/[...path]     Proxy to HighTribe API
      luma/[...path]          Proxy to Luma API
      eventbrite/[...path]    Proxy to Eventbrite API
      webhooks/                Inbound booking webhooks + setup helper
  components/                 UI (Sidebar, modals, landing, loaders, …)
  lib/
    backend-client.ts         getBackendUrl() / backendFetch() / backendJson()
    ewentcast-session.ts      Client-side session helpers
    channel-connection.ts, channel-disconnect.ts
    channel-db-mappers.ts, channel-data-sync.ts, channel-events-store.ts
    dashboard-stats.ts, sync-all-connected.ts, sync-hightribe-after-connect.ts
    event-registry.ts         Registry client (calls Express /api/registry)
    ticket-sync.ts            Webhook handler + cross-channel capacity sync
    publish-event.ts          Publish flow to all channels
    settings-store.ts         File-based settings fallback (no-auth path)
    password.ts
    db.ts                     Legacy SQLite (unused, kept for reference)
backend/
  src/
    index.ts                  Express entrypoint (mounts routers, runs migrations on boot)
    config.ts                 Env config (BACKEND_PORT, DB, SMTP, APP_URL, …)
    db/
      pool.ts                 mysql2 connection pool
      migrate.ts               Applies pending migrations, seeds registry from JSON if empty
      migrate-fresh.ts         Drops all app tables and re-applies migrations (--seed optional)
      migrations/              001_registry, 002_users_auth, 003_channel_events,
                                004_channel_bookings, 005_repair_auth_tables
    middleware/auth.ts         requireAuth — validates Bearer session token
    routes/                    health, auth, events, settings, registry
    services/                  auth, bookings, channel-data, email, events,
                                hightribe-connect, registry, user-settings
data/
  eventlifter.db, .db-wal      Legacy SQLite (gitignored, unused by live code)
  event-registry.json          One-time MySQL seed source if master_events is empty
```

## Quick start

### Requirements

- Node.js 20+
- npm
- MySQL server (local or remote)

### Local dev (Laragon or plain Node)

1. Create a MySQL database (e.g. `channel_manager_db`) and set `CHANNEL_MANAGER_DB_*` in `.env.local`.
2. Install deps and run migrations:

```bash
npm install
npm run migrate
```

3. Start both processes:

```bash
npm run dev
```

This runs Next.js (`dev:web`, port 3000) and the Express API (`dev:api`, port 4000) together via `concurrently`.

Open:

- **Landing:** http://localhost:3000/
- **App:** http://localhost:3000/signup or `/login` → dashboard at `/dashboard`

With Laragon, you can proxy a `.test` host to port 3000 (e.g. `http://eventlifter-core.test`).

### Production build

```bash
npm run build
npm start
```

`npm start` runs `start:web` (`next start`, port 3000) and `start:api` (`tsx backend/src/index.ts`, port `BACKEND_PORT`) together. The Express API runs its migrations automatically on boot.

## Configuration

Configuration lives in two places:

- **Env vars** (`.env` / `.env.local`) — required for the database, SMTP, and process wiring (see table below).
- **Settings UI** (`/settings`) — per-user channel credentials (HighTribe, Luma, Eventbrite), stored via the Express API in MySQL. If a request has no auth token, settings fall back to a local `settings.json` file.

### Environment variables

| Var | Purpose |
|---|---|
| `CHANNEL_MANAGER_DB_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_NAME` | MySQL connection for the Express API (port defaults to 3306, name defaults to `channel_manager_db`) |
| `BACKEND_PORT` | Express API port (default `4000`) |
| `BACKEND_URL` | Overrides the computed backend URL — only needed if the API runs on a different host than Next.js |
| `APP_URL` | Public site URL — used for OAuth redirects, webhooks, CORS origin, and emails (prod default `https://ewentcast.com`) |
| `DB_HEALTH_TOKEN` | Required to call `GET /db-health` on the backend |
| `AUTH_EXPOSE_RESET_TOKEN` | If true, exposes the password-reset token/link directly instead of requiring email (dev convenience; default true outside production) |
| `AUTH_RESET_TOKEN_HOURS` | Password-reset token expiry in hours (default 2) |
| `AUTH_SESSION_DAYS` | Session length in days (default 30) |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASS` / `_FROM` | SMTP config for password-reset emails (e.g. Mailtrap in dev) |
| `SETTINGS_FILE` | Path to the fallback settings JSON file (default `./settings.json`) |
| `LUMA_API_KEY`, `LUMA_CALENDAR_ID`, `LUMA_API_BASE_URL`, `LUMA_DISCOVER_BASE_URL` | Luma config (optional — can be set via Settings UI) |
| `EVENTBRITE_CLIENT_ID` / `_CLIENT_SECRET` / `_REDIRECT_URI` / `_PRIVATE_TOKEN` | Eventbrite OAuth app or private token |
| `HIGHTRIBE_SERVICE_URL`, `HIGHTRIBE_API_KEY`, `HIGHTRIBE_WEBHOOK_SECRET`, `HT_API_BASE` | HighTribe config |
| `DATA_DIR` | Legacy — SQLite path override, no longer used by any live route |

See `.env.example` for the full annotated list.

## Data & sync model

### MySQL (primary store, owned by the Express API)

| Table(s) | Purpose |
|---|---|
| `users`, `sessions`, `password_reset_tokens`, `subscriptions`, `ht_connections`, `user_settings` | Ewentcast accounts, auth, HighTribe connection, subscription state |
| `master_events`, `channel_refs`, `attendees` | Cross-channel event registry — links one event across channels + webhook attendees |
| `app_settings` | Legacy/global settings table from the original registry schema |
| `luma_events`, `eventbrite_events`, `hightribe_events` | Per-user cached channel event data (`payload_json`) |
| `channel_bookings` | Per-user, per-channel cached bookings (unique on `user_id, channel, external_id`) |
| `schema_migrations` | Tracks applied migrations |

Run `npm run migrate` to apply pending migrations, or `npm run migrate:fresh` (optionally `-- --seed`) to drop and rebuild all app tables from scratch.

### When data updates

| Trigger | What happens |
|---------|----------------|
| **Page load** | Reads from MySQL via the Express API — no external channel API calls |
| **↻ Sync from channels** | Next.js calls HighTribe / Luma / Eventbrite, then upserts into MySQL via `api/events/[channel]/sync` |
| **Webhook** | Updates the registry + `channel_bookings` immediately (no sync button needed) |

### Webhooks

| Channel | Endpoint |
|---------|----------|
| HighTribe | `POST /api/webhooks/hightribe` |
| Luma | `POST /api/webhooks/luma` |
| Eventbrite | `POST /api/webhooks/eventbrite` |

**Important:** A webhook only creates a booking if the event is **linked in the registry** (published/synced through Ewentcast first). Otherwise the payload is acknowledged but skipped.

**HighTribe (Laravel backend):** Set in Laravel `.env`:

```env
CHANNEL_MANAGER_WEBHOOK_URL=https://your-domain/api/webhooks/hightribe
CHANNEL_MANAGER_WEBHOOK_SECRET=same-secret-as-settings-ui
```

Use the same secret in **Settings → HighTribe → Webhook secret**.

Register Luma + Eventbrite webhooks from **Settings** (calls `POST /api/webhooks/setup`) or configure them manually to point at your `/api/webhooks/*` URLs.

## App routes

| Path | Description |
|------|-------------|
| `/` | Public landing page |
| `/login`, `/signup` | Ewentcast account auth |
| `/forgot-password`, `/reset-password` | Password reset flow |
| `/subscribe` | Subscription flow |
| `/dashboard` | Stats, recent events & bookings |
| `/events` | Manage events by channel |
| `/bookings` | All registrations |
| `/channels` | Connection overview |
| `/settings` | Credentials & webhook setup |
| `/create` | Create / publish wizard |

## API routes (summary)

### Next.js (`app/api/*` — mostly proxies to the Express API)

| Method | Path | Description |
|--------|------|-------------|
| * | `/api/auth/*` | Proxy to Express auth (register/login/logout/me/forgot-password/reset-password/HighTribe connect) |
| GET | `/api/health`, `/api/db-health` | Backend health checks |
| GET | `/api/events/:channel` | Cached events (`hightribe` \| `luma` \| `eventbrite`) |
| POST | `/api/events/:channel/sync` | Upsert channel events into MySQL |
| POST | `/api/events/:channel/sync-bookings` | Upsert channel bookings into MySQL |
| GET | `/api/events/bookings` | All channels' bookings for the current user |
| DELETE | `/api/events/:channel`, `/api/events/:channel/:externalId` | Purge cached channel data |
| GET/POST | `/api/registry` | Proxy to the master event registry |
| GET/PUT | `/api/settings`, `/api/settings/:channel` | Per-user settings (auth) or `settings.json` fallback |
| POST | `/api/webhooks/setup` | Register Luma + Eventbrite webhooks |
| * | `/api/hightribe/*` | HighTribe API proxy |
| * | `/api/luma/*` | Luma API proxy |
| * | `/api/eventbrite/*` | Eventbrite API proxy |

### Express (`backend/`, default `http://127.0.0.1:4000`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health`, `/db-health` | Health checks (`db-health` requires `DB_HEALTH_TOKEN`) |
| POST | `/api/auth/register`, `/login`, `/logout`, `/forgot-password`, `/reset-password` | Account auth |
| GET | `/api/auth/me` | Current session |
| POST | `/api/auth/login-hightribe`, `/connect-hightribe`, `/disconnect-hightribe` | HighTribe account linking |
| GET | `/api/events/:channel`, `/api/events/bookings` | Read cached channel data (auth) |
| POST | `/api/events/:channel/sync`, `/sync-bookings` | Upsert channel data (auth) |
| DELETE | `/api/events/:channel`, `/:externalId` | Purge channel data (auth) |
| GET/PUT | `/api/settings` | Per-user settings (auth) |
| DELETE | `/api/settings/:channel` | Remove a channel's settings (auth) |
| GET/POST | `/api/registry` | Master event registry (create/link/unlink/delete/register_attendee) |

## Scripts

```bash
npm run dev            # Next.js (3000) + Express API (4000), concurrently
npm run build           # Production build (Next.js only)
npm run start           # Production Next.js + Express API, concurrently
npm run migrate         # Apply pending MySQL migrations
npm run migrate:fresh   # Drop all app tables and re-apply migrations (add -- --seed to reseed from event-registry.json)
npm run lint             # ESLint
```

## Gitignored files

Do not commit:

- `.env`, `.env.local` — local env overrides (DB credentials, SMTP, etc.)
- `settings.json` — local fallback channel settings
- `data/*.db` and `data/*.db-*` — legacy SQLite files (unused)
- `backend/dist/` — ad-hoc backend build output (not used by npm scripts)
- `.next/` — build output

## License

Private — EventLifter / Ewentcast internal use.
