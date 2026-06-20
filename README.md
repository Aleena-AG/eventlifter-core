# Ewentcast — Channel Manager

Create an event once, publish it to **HighTribe**, **Eventbrite**, and **Luma**, and keep bookings in one place. Shared capacity sync helps you list everywhere without double-selling the same seat.

Public marketing site lives at `/`. The signed-in app (dashboard, events, bookings, settings) lives behind HighTribe login.

## Features

- **Multi-channel publish** — create/sync events across HighTribe, Luma, and Eventbrite
- **Unified dashboard** — events, tickets sold, bookings, and recent activity per channel
- **Bookings list** — attendees from API sync and inbound webhooks, deduped by email
- **SQLite cache** — channel data is stored locally; pages read from the DB instead of calling external APIs on every load
- **Webhooks** — Eventbrite, Luma, and HighTribe booking webhooks update the registry and bookings table in real time
- **Capacity sync** — when a ticket sells on one channel, remaining capacity can be pushed to linked channels

## Tech stack

| Layer | Choice |
|--------|--------|
| App | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, warm Ewentcast theme |
| Database | **SQLite** (`better-sqlite3`) — `data/eventlifter.db` |
| Settings & credentials | SQLite `app_settings` table + Settings UI |
| Auth | HighTribe Bearer token (browser `localStorage`) |

## Project layout

```
src/
  app/
    page.tsx                 Public landing page
    dashboard/               Main dashboard (after login)
    events/                  Events per channel
    bookings/                All bookings
    channels/                Connection status
    settings/                API keys, tokens, webhook secret
    login/                   HighTribe sign-in
    create/                  Ewentcast event wizard
    api/
      sync/                  POST — pull data from channels into SQLite
      data/dashboard/        GET — dashboard stats from DB
      data/bookings/         GET — bookings from DB
      data/events/           GET — cached events by channel
      registry/              Master event registry (links + attendees)
      settings/              Read/write app settings (SQLite)
      hightribe/[...path]    Proxy to HighTribe API
      luma/[...path]         Proxy to Luma API
      eventbrite/[...path]   Proxy to Eventbrite API
      webhooks/              Inbound booking webhooks + setup helper
  components/                UI (Sidebar, modals, landing, loaders, …)
  lib/
    db/                      SQLite: registry, bookings, events, settings
    server/                  Server-only sync + dashboard builders
    event-registry.ts        Registry types + SQLite-backed CRUD
    ticket-sync.ts           Webhook handler + cross-channel capacity sync
    publish-event.ts         Publish flow to all channels
    data-api.ts              Client helpers for sync + DB reads
data/
  eventlifter.db             SQLite — all app data (gitignored)
  eventlifter.db-wal         WAL journal (gitignored, created at runtime)
  event-registry.json        One-time import into SQLite if DB was empty
```

## Quick start

### Requirements

- Node.js 20+
- npm

### Local dev (Laragon or plain Node)

```bash
npm install
npm run dev
```

Open:

- **Landing:** http://localhost:3000/
- **App:** http://localhost:3000/login → dashboard at `/dashboard`

With Laragon, you can proxy a `.test` host to port 3000 (e.g. `http://eventlifter-core.test`).

### Production build

```bash
npm run build
npm start
```

Ensure the `data/` directory is writable so SQLite can create `eventlifter.db`.

## Configuration

Most configuration is done in the app under **Settings** (`/settings`). Values are stored in the **SQLite** `app_settings` table (same file as bookings/events).

Optional: set `DATA_DIR` in `.env` on production so the DB path is explicit.

| Channel | What to configure |
|---------|-------------------|
| **HighTribe** | Sign in with your HighTribe account (token stored in browser). Optional: service URL + webhook secret. |
| **Luma** | Luma Plus API key, calendar ID, API base URLs |
| **Eventbrite** | OAuth app (client ID/secret/redirect) or private token |

Optional env fallback for HighTribe API base:

```bash
HT_API_BASE=https://api.hightribe.com
```

Eventbrite OAuth redirect defaults to `http://localhost:3000/api/eventbrite/callback` in settings.

## Data & sync model

### SQLite (primary store)

On first run, the app creates `data/eventlifter.db` and imports `data/event-registry.json` if the DB is empty.

| Table / area | Purpose |
|--------------|---------|
| `app_settings` | API keys, tokens, webhook secrets |
| `master_events`, `channel_refs`, `attendees` | Linked events + webhook attendees |
| `bookings` | Unified booking list (API sync + webhooks) |
| `channel_events` | Cached event lists per channel |
| `channel_stats` | Aggregated counts from last sync |
| `sync_meta` | e.g. `last_sync_at` timestamp |

### When data updates

| Trigger | What happens |
|---------|----------------|
| **Page load** | Reads from SQLite only — no external API calls |
| **↻ Sync from channels** | Calls HighTribe / Luma / Eventbrite APIs, writes to SQLite |
| **Webhook** | Updates registry + `bookings` immediately (no sync button needed) |

HighTribe sync requires a logged-in user (Bearer token sent with `POST /api/sync`).

### Webhooks

Webhook endpoints:

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
| `/login` | HighTribe login |
| `/dashboard` | Stats, recent events & bookings |
| `/events` | Manage events by channel |
| `/bookings` | All registrations |
| `/channels` | Connection overview |
| `/settings` | Credentials & webhook setup |
| `/create` | Create / publish wizard |

## API routes (summary)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sync` | Sync all configured channels into SQLite |
| GET | `/api/data/dashboard` | Dashboard stats from DB |
| GET | `/api/data/bookings` | Bookings from DB |
| GET | `/api/data/events?channel=` | Cached events (`hightribe` \| `luma` \| `eventbrite`) |
| GET/POST | `/api/registry` | Master event registry |
| GET/PUT | `/api/settings` | App settings |
| POST | `/api/webhooks/setup` | Register Luma + Eventbrite webhooks |
| * | `/api/hightribe/*` | HighTribe API proxy |
| * | `/api/luma/*` | Luma API proxy |
| * | `/api/eventbrite/*` | Eventbrite API proxy |

## Scripts

```bash
npm run dev      # Development server (port 3000)
npm run build    # Production build
npm run start    # Run production server
npm run lint     # ESLint
```

## Gitignored files

Do not commit:

- `data/*.db` and `data/*.db-*` — SQLite database + WAL files
- `.env` — local env overrides (optional `DATA_DIR`)
- `.next/` — build output

## License

Private — EventLifter / Ewentcast internal use.
