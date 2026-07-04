# Kaiden — MVP build plan

Milestones for Phase 1, in dependency order. Each has a definition of done; a milestone isn't done until its DoD passes end-to-end. Architecture context in [architecture.md](architecture.md).

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
