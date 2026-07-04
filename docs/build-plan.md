# Kaiden — MVP build plan

Milestones for Phase 1, in dependency order. Each has a definition of done; a milestone isn't done until its DoD passes end-to-end. Architecture context in [architecture.md](architecture.md).

## Status (updated 2026-07-04)

- **M0 ✅** — monorepo, schema + migration `0000`, CI. Deployed: web on Vercel (kaiden.social, auto-deploy from main).
- **M1 ✅** — gateway passthrough live-verified against real api.anthropic.com. Dev mode: `KAIDEN_DEV_KEY=… pnpm --filter @kaiden/gateway dev`.
- **M2 ✅ (code + tests)** — pure engine in `packages/xp-engine` (`computeUser` = full deterministic replay; rule ids + the 1-XP-usage-row rationale documented in `src/rules.ts`); processor + CLI in `apps/api` (`pnpm --filter @kaiden/api xp:process <handle>|--all`). Config calibrated to v2026.07.1 (usage curve scale 8/unit 250, new one-time `connected` 25 XP). **Open:** Docker has never been up on the dev machine — `db:migrate`, `seed:dev`, and one processor run against live Postgres remain unexercised (everything is covered by pure tests; the drizzle calls are the only untested surface).
- **M3 ✅** — better-auth (email+password always on; GitHub OAuth env-gated on GITHUB_CLIENT_ID/SECRET; magic link deferred to M4 pending an email provider) mounted on Fastify at `/api/auth/*`; `/v1/me/*` routes: profile, stats, achievements, keys mint/list/revoke, `POST xp/process`, onboarding status (polling — SSE deferred to M4). XP trigger: 60s sweep in the api (XP_PROCESS_INTERVAL_MS). **The DoD runs as a test:** apps/api/src/integration.test.ts drives signup → key → real gateway → XP → profile against PGlite (in-process Postgres, migrations applied) — this also closed the old "never ran against a live DB" gap; Docker is now only needed for actually running locally, not for coverage. Caveats: key revocation takes effect within the gateway's 60s cache TTL; single `users` table serves auth + game profile.
- **M4 ✅ (code; hosting pending)** — full PWA: landing/signup/login, home stats screen (rank card + XP bar, streaks, 14-day activity chart, achievements), connect page (key mint shown-once, per-SDK snippets, QR handoff, live first-event polling + celebration), client-canvas 9:16 share card with share-sheet (deviation: build plan said server-rendered — client canvas avoids font vendoring; revisit for public-profile unfurls), installable manifest + SW + generated icons, web push end-to-end (VAPID, subscribe endpoints, level-up/achievement pushes and timezone-aware streak-at-risk in the api sweep). No CORS needed: the web app proxies `/api/*` + `/v1/*` to the api via Next rewrites (API_ORIGIN env on Vercel once hosted). Dev without Docker: `DATABASE_URL=pglite://.data/dev DEV_EMBED_GATEWAY=1` runs api+gateway in one process. **Remaining for the M4 DoD:** host gateway + api (user decision: Fly/Railway), set API_ORIGIN + NEXT_PUBLIC_GATEWAY_URL + BETTER_AUTH_SECRET + VAPID keys in prod, then the real-phone signup→first-XP and locked-iPhone push checks.
- **M5 ✅** — Phase 1 complete. Moments: engine emits deterministic MomentProposals (deep-session / marathon / new-model) with metadata-only chips + pre-drafted copy; persisted via upsert on idempotency_key (converge-to-latest, unlike the append-only ledger — a mid-day draft grows with the session; migration 0003). Wrapped v0: GET /v1/me/wrapped?month=YYYY-MM aggregates daily_activity + ledger + moments; 9:16 canvas card on home (shows once connected). The moments table is feed-renderable tomorrow — Phase 2's first job is a GET /feed over it.

**Phase 1 is done.** Post-M5 polish: key-in-path gateway auth (`/k/<key>/<provider>/…`) for header-less tools + tool-first connect guides (Claude Code, Cursor, OpenWebUI, Python, TS, curl) — the gateway-friction mitigation from brief §13. Path keys are log-redacted (`/k/[redacted]/`), privacy-suite enforced.

## Phase 2 status

- **P2 v1 ✅ (2026-07-04)** — the showcase layer, vibe-coder framing (user decision: legible artifacts over developer workflow files; receipts stay the differentiator). Posts with verified metadata-only chips, public feed (`/feed`), <30s composer (`/post/new`), kudos (self-kudos blocked, XP idempotent per post+user across toggles), copy-the-recipe (+15 to author), public profiles (`/@handle` → `/u/[handle]`), soft delete. Social XP live via `apps/api/src/xp/social.ts` into the same ledger (rule ids: waza-published / kudos-received / waza-copied). Config v2026.07.2.
- **P2 comments ✅ (2026-07-04)** — flat (no threads, Strava model), deliberately NO XP either direction (farmable; ledger-level test enforces), 1000-char/20-day caps, soft-delete by comment author OR post owner (host moderation), author push on non-self comments → deep-links to `/p/[id]` detail page. Migration 0005.
- **P2 next**: follows + following feed, kudos push notifications, leaderboards (seasonal, per brief), post-from-moment UI (composer prefilled from a detected moment), URL previews/images, moderation beyond soft-delete (report button before any open signup), invite mechanics for the alpha.

Also open: user dogfooding + real-phone checks; pre-launch checklist (provider ToS legal review, trademark/domain + Japanese vocab check, email provider for verification/magic links).

## M0 — Skeleton

- pnpm workspace with `apps/gateway`, `apps/api`, `apps/web`, `packages/{xp-engine,xp-config,db,shared}`.
- Drizzle schema for the core tables (architecture §4) + first migration; local Postgres via docker-compose.
- `xp-config` package encoding brief §6 verbatim (constants, caps, curve base/exponent) with a config version identifier.
- CI: typecheck, lint, test on every push; the privacy grep-the-sinks test slot wired in from day one, even while trivial.

**DoD:** fresh clone → `pnpm i && pnpm dev` brings up all three apps against local Postgres; CI green.

## M1 — Gateway (the product's spine)

- Anthropic + OpenAI passthrough incl. SSE streaming; provider auth headers forwarded untouched, never persisted.
- `X-Kaiden-Key` resolution (hashed lookup, cached); unknown key → clear 401 that doesn't leak whether the key exists.
- Usage extraction: non-streaming JSON `usage`; Anthropic stream events; OpenAI `stream_options.include_usage` injection + synthetic-chunk swallowing (architecture §3).
- `usage_events` writes: fire-and-forget, buffered, never on the response path.
- Privacy test suite: assertions that no request/response body content reaches DB, logs, or error reports.

**DoD:** real Anthropic and OpenAI SDK calls (streaming and not) through the local gateway return byte-identical results to direct calls, and correct metadata rows appear; privacy suite green.

## M2 — XP engine

- Event → ledger pipeline: active-day, log-scaled usage XP with daily cap, streak bonus outside the cap, behavior bonuses (first model/provider, multi-provider day, tool-use day, deep session via `X-Kaiden-Session` turn depth).
- Streak computation, timezone-aware; `daily_activity` aggregation.
- Level/rank derivation from config; **curve calibration pass** — resolve the (L−1) indexing flag (architecture §5), fix kyū/dan ↔ level mapping, season length.
- Achievements v1 (behavioral, per brief §12) — candidates to finalize: *Polyglot* (3 providers in one day), *Night Shift* (session after midnight), *Marathon* (25+ turn thread), *Early Adopter* (new model within 7 days of its ID appearing), *Comeback* (return after 14+ days away).
- Replay/backfill command proving determinism and idempotency.

**DoD:** property-style tests: a simulated bot hammering requests earns ≤ cap; a simulated enthusiast month lands in the brief's target level band; replaying a month of events twice produces identical ledgers.

## M3 — Accounts + API

- better-auth (GitHub OAuth + magic link), handle claim, timezone capture at signup.
- Kaiden key issuance/rotation/revocation.
- Endpoints: profile (rank, XP bar, streak), stats (daily/weekly usage, breadth), achievements, onboarding-status SSE for the desktop handoff page.

**DoD:** full API flow exercisable with curl: sign up → issue key → (M1 gateway call) → poll profile and see XP/level move.

## M4 — PWA

- Onboarding: signup → QR/link handoff → desktop setup page with per-framework snippets → live "first event" moment on both screens (architecture §6).
- Stats screen (the Phase 1 home): rank + XP bar, streak flame, usage graphs, achievements.
- Web push: level-up, achievement, streak-at-risk cron.
- Share cards: 9:16 server-rendered PNGs (level-up, streak milestone), dark-mode-first, native share sheet.
- Installable PWA (manifest, service worker, iOS push).

**DoD:** a new user on a real phone gets from signup to first XP in under 10 minutes with no human help; share card posts legibly to an IG story; streak-at-risk push arrives on a locked iPhone.

## M5 — Phase 2 seeding + Wrapped v0

- `moments` written for notable sessions (deep/multi-tool/new-model) with pre-drafted post copy — the <30s posting flow's raw material, unpublished for now.
- Monthly "Wrapped" summary card from `daily_activity`.
- Instrumentation review: every event the Phase 2 feed needs is being captured with the right shape.

**DoD:** a month of dogfood usage produces a Wrapped card worth actually sharing, and a moments table a feed could render tomorrow.

---

## Sequencing notes

- M1 before everything user-facing: no gateway, no data, no game. Dogfood it on our own AI usage from the day it works — that's also the Goodhart monitoring feed.
- M2 is pure functions on M0's schema; can start in parallel with M1 once event shapes freeze.
- Launch checklist items from the brief that are **not** engineering and shouldn't wait for M4: trademark/domain search, Japanese-speaker vocabulary review, provider ToS legal review.
