# EventLifter — Channel Manager Core

The adapter core for EventLifter: create a master event once, publish it to **HighTribe, Eventbrite, and Luma**, and pull attendees back into one place. This is the backend crux the rest of the product bolts onto.

> Meetup and Partiful are intentionally out of scope. Meetup gates its API behind a Pro subscription + manual approval; Partiful has no public API. Add them later as their own adapters if/when that changes — nothing else has to move.

## The one idea

**Capability is data, not an assumption.** Every channel is an adapter that declares what it can do (`publish`, `pullAttendees`, `webhooks`, …). The orchestrator and dashboard branch on those declarations, so an uneven channel degrades gracefully instead of breaking the system. There is no `if (channel === "x")` anywhere outside an adapter.

## Layout

```
src/
  types.ts                 MasterEvent + all domain types (source of truth)
  channels/
    adapter.ts             ChannelAdapter interface, registry, HTTP helper
    eventbrite.ts          real EB adapter (draft → ticket_class → publish)
    luma.ts                real Luma adapter (x-luma-api-key)
    hightribe.ts           native adapter (wraps your internal service)
  mapping/
    eventbrite.map.ts      MasterEvent → EB venue/event/ticket bodies
    luma.map.ts            MasterEvent → Luma create body
  services/
    publish.ts             capability-gated publish orchestrator
    connections.ts         OAuth / API-key / native connect flows
    webhooks.ts            webhook router + two-stage dedupe key
  queue/
    queues.ts              BullMQ queues + shared Redis connection
    enqueue.ts             enqueue helpers (idempotency keys)
    workers.ts             publish + sync-in workers (retry / auth handling)
  stores/
    memory.ts              in-memory stores (zero-infra local mode)
    prisma.ts              Postgres-backed stores (production)
  http/
    server.ts              Express API: connect / publish / status / webhooks
  crypto.ts                AES-256-GCM credential encryption
  ports.ts                 storage contracts (implement against Prisma)
  index.ts                 registry wiring + `npm run dry`
prisma/
  schema.prisma            Postgres schema (matches the technical spec)
```

## Run it

```bash
npm install
npm run dry          # prints the exact EB + Luma request bodies for a sample event — no network, no creds
npm run typecheck    # tsc --noEmit
```

To go live:

```bash
cp .env.example .env          # fill in Postgres, Redis, Eventbrite OAuth app
npm run prisma:migrate        # create the tables
npm run prisma:generate
```

Then wire connections (per host, stored encrypted in `channel_connections`):
- **Eventbrite** — OAuth2; store `{ accessToken, organizationId }`.
- **Luma** — host pastes a **Luma Plus** API key; store `{ apiKey, calendarId? }`.
- **HighTribe** — native; pass `{ internalHostId }`.

And publish:

```ts
const registry = buildRegistry(yourHighTribeClient);
const orchestrator = new PublishOrchestrator(registry);
const results = await orchestrator.publish(masterEvent, ["hightribe","eventbrite","luma"], connections);
// results: per-channel { status, ref?, error? }; rollupStatus(results) for the event
```

## Run as a local server (zero infra)

`npm run dev` boots the Express API in **in-memory mode** — no Postgres, no Redis. Connections, events, and registrations live in process memory and reset on restart; credentials are still encrypted on the way in. Publishing runs inline (synchronously) instead of through the queue.

```bash
npm run dev          # -> http://localhost:3000
```

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness + channel list |
| GET | `/connections/:channel/start?hostId=` | OAuth consent URL (Eventbrite) |
| GET | `/connections/eventbrite/callback?code=&state=` | OAuth callback -> stores token |
| POST | `/connections/:channel` | API-key (Luma) / native (HighTribe) connect |
| DELETE | `/connections/:channel?hostId=` | disconnect |
| POST | `/events` | create a master event |
| POST | `/events/:id/publish` | publish to enabled channels |
| GET | `/events/:id/status` | per-channel sync state |
| POST | `/webhooks/:channel?eventId=` | inbound webhook (verify -> parse -> upsert) |

Walk-through with `curl`:

```bash
curl -X POST localhost:3000/connections/hightribe -H 'Content-Type: application/json' -d '{"hostId":"host_1"}'

curl -X POST localhost:3000/events -H 'Content-Type: application/json' \
  -d '{"hostId":"host_1","title":"Rooftop Session","ticketType":"paid","priceCents":2500,"capacity":150}'

curl -X POST localhost:3000/events/<ID>/publish     # HighTribe -> synced; EB/Luma -> "no connection"
curl localhost:3000/events/<ID>/status
```

Connect **Eventbrite** by setting `EVENTBRITE_CLIENT_ID/SECRET/REDIRECT_URI` in `.env`, then hitting `/connections/eventbrite/start`. Connect **Luma** with `POST /connections/luma` and `{ "hostId":"host_1", "credentials": { "apiKey":"secret-..." } }` (a real Luma Plus key).

## What's real vs. what's stubbed

**Real and ready:**
- Adapter interface + registry + capability gating.
- Eventbrite adapter: real v3 endpoints and the true create sequence (venue → draft event → ticket class → publish), attendee pagination, webhook reference-fetch handling.
- Luma adapter: real `public-api.luma.com` endpoints, `x-luma-api-key` auth, guest pagination, inline-webhook parsing.
- Field mapping for both, including EB's `cost: "USD,2500"` format, visibility-as-three-booleans, and Luma's `geo_address_json` / `require_rsvp_approval`.
- Publish orchestrator with partial-failure semantics and auth/rate-limit classification.
- **Connection flows** (`services/connections.ts`): Eventbrite OAuth round-trip (auth URL → code exchange → org resolve), Luma key validation, native HighTribe connect.
- **Queue layer** (`queue/`): BullMQ publish + sync-in workers with per-channel retries, idempotency keys, and auth-error handling (expired tokens stop retrying instead of looping).
- Prisma schema for the full data model (attendees vs. registrations split, external map, webhook log, sync jobs).

**Stubbed / you wire it:**
- **HighTribe adapter** — implement `HighTribeClient` against your real event service. The shape is defined; swap the bodies.
- **Storage** — implement the three ports in `ports.ts` (`ConnectionStore`, `EventStore`, `RegistrationStore`) against Prisma. Adapters, orchestrator, and workers are pure and depend only on those interfaces.
- **Credential encryption** — `credentials` is `Bytes`; envelope-encrypt with your KMS inside `ConnectionStore.save`.
- **Webhook signature verification** — `verifyWebhook` is a hook; implement each channel's scheme before trusting payloads.
- **HTTP routes** — thin Nest/Express handlers that call `ConnectionService`, enqueue publishes, and accept webhooks (verify → persist → enqueue → 200).

## Verify before you ship

API field names are versioned and drift. Confirm against live docs before depending on them:
1. Eventbrite webhook action names + the `order`/`attendee` payload paths.
2. Luma `event/create` body, `create-ticket-type` path, and guest webhook shape (Plus account).
3. Eventbrite category IDs (`EB_CATEGORY_IDS` is a starter map — pull from `GET /categories/`).
4. Which Luma base host your key targets (`public-api.luma.com` vs `api.lu.ma/public/v1`).
