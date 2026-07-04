# Kaiden — MVP architecture (v0)

Companion to [../kaiden-product-brief.md](../kaiden-product-brief.md). Covers Phase 1 (solo) only, but every choice is checked against "doesn't preclude Phase 2/3."

**Status:** proposed, 2026-07-04. The stack below is a recommendation — veto anything here before M0 scaffolding starts (see [build-plan.md](build-plan.md)).

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language across gateway/API/web; solo-founder velocity; the reference gateways in this space (Helicone) are TS |
| Monorepo | pnpm workspaces | Shared types between gateway, XP engine, and app without publishing packages |
| Gateway | Node + Fastify | Low-overhead streaming reverse proxy; first-class SSE passthrough |
| API | Fastify (separate deployable from gateway) | Gateway must stay tiny and boring — it's in the user's critical path. Product API churns; keep them apart |
| Database | Postgres + Drizzle ORM | Append-only ledgers and aggregates are relational; Drizzle keeps schema in TS |
| Web app | Next.js PWA | MVP scope allows "PWA first"; iOS supports PWA web push since 16.4, which unlocks streak notifications without an app store cycle. Revisit native (Expo) at Phase 2 when the feed ships |
| Push | Web Push (VAPID) | Works on installed PWA, iOS + Android + desktop |
| Share cards | satori + resvg (server-rendered 9:16 PNG) | Deterministic, brandable, no headless browser |
| Auth | better-auth, GitHub OAuth + magic link | Target users are developers; GitHub login is the native choice |
| Hosting (suggested) | Gateway on Fly.io (long-lived streams, regional), web on Vercel, Postgres on Neon | Defer final call to M4; nothing depends on it |

## 2. Repo layout (planned)

```
apps/
  gateway/     # the proxy — small, boring, independently deployable
  api/         # product API: auth, profiles, stats, onboarding
  web/         # Next.js PWA: onboarding, stats, share cards
packages/
  xp-engine/   # pure functions: (events, state, config) → ledger entries
  xp-config/   # ALL XP constants, level curve, achievement defs — versioned
  db/          # Drizzle schema + migrations
  shared/      # types shared across apps
docs/
```

`xp-config` is its own package to enforce the brief's rule mechanically: rebalancing is a config change, reviewable in isolation, and the engine takes config as an argument — no constant ever lives in engine code.

## 3. Gateway design

The activation flow is a base-URL swap, Helicone-style:

- Anthropic: `base_url = https://gw.kaiden.app/anthropic` (SDK appends `/v1/messages`)
- OpenAI: `base_url = https://gw.kaiden.app/openai/v1`
- User identity: `X-Kaiden-Key: kd_live_…` header set via the SDK's default-headers option. Kaiden keys are issued per user, stored hashed.

**Provider keys pass through untouched and are never stored.** The user's `Authorization`/`x-api-key` header transits to the provider as-is. This is materially better for trust than the OpenRouter model (registering provider keys with us) and costs nothing at MVP.

**Privacy engineering (the hard line, mechanically enforced):**
- Request/response bodies are piped through in memory and never written — no body logging, no error-report bodies, redacted upstream error passthrough.
- The only parsing is structured usage fields: non-streaming responses' `usage` JSON; Anthropic SSE `message_start`/`message_delta` usage; OpenAI streams need `stream_options.include_usage` — if the client didn't set it, the gateway injects it and swallows the synthetic final usage chunk so the client sees exactly the stream it asked for.
- A test suite asserts no body content ever reaches the events table or logs (grep-the-sinks style test, run in CI).
- Option to state loudly in-product: open-source the gateway so "metadata only" is verifiable, not just promised. Decide by launch.

**Reliability posture:** if Kaiden's metadata write fails, the user's request must still succeed — event emission is fire-and-forget with local buffering. The gateway being down means the user's own tooling breaks, so it stays tiny: no product logic, no DB reads on the hot path (kaiden-key lookup cached), no deploys coupled to app releases.

**Captured per request (metadata only):** timestamp, provider, model, prompt/completion token counts, streaming flag, tool-use flag, tool-call count, stop reason, latency, client user-agent, and a client-supplied optional thread/session hint header (`X-Kaiden-Session`) for turn-depth detection.

## 4. Data model (core tables)

- `users` — handle, timezone (required — streaks and "active day" are user-local-midnight concepts), `lifetime_xp`, `season_xp`, `current_streak`, `longest_streak`, denormalized `level` for display.
- `gateway_keys` — user_id, key hash, label, last_used_at.
- `usage_events` — append-only; the metadata list above. Source of truth; everything else recomputable from it.
- `xp_ledger` — append-only: user_id, amount (never negative — no clawback by construction), `rule_id`, `config_version`, `season_id`, day, idempotency key (`user/rule/day` for daily-capped rules). XP totals = sums over the ledger.
- `daily_activity` — per user-day aggregate (requests, tokens, providers used, behavior flags); powers caps, streaks, and the stats screen without scanning events.
- `achievements` / `user_achievements` — definitions live in `xp-config`, grants in DB.
- `moments` — Phase 2 seed, written from day one: notable-session records ("deep session, 42 turns, 2 tools") shaped as postable feed items, unpublished in Phase 1.

Levels/ranks are derived from XP + config (never stored as truth, only cached); `season_id` on the ledger from day one per the brief.

## 5. XP engine

Pure package, no I/O: `(new events, prior daily state, config) → ledger entries + achievement grants`. Properties this buys:

- **Deterministic and replayable.** Events are the source of truth, so new rules can be backfilled and bugs re-run — additively only, honoring no-clawback.
- **Idempotent.** Ledger idempotency keys make reprocessing safe; daily-capped rules structurally can't double-fire.
- **Config-versioned.** Every ledger row records the config version that produced it.

Rules v1 = exactly the brief's §6 table, expressed in `xp-config`.

**⚠ Level-curve calibration flag:** as written ("XP to reach level L ≈ 200 × L^1.6"), level 2 costs ~600 XP — not reachable in session one against the ~150/day cap plus first-use bonuses (~230 max), which breaks the brief's own "level 2 in first session" target. Indexing the curve as `200 × (L−1)^1.6` fixes it (level 2 = 200 XP ✓) and still lands ~level 9 at month one for a 180 XP/day user ✓. Recommend the (L−1) form; needs a proper calibration pass in M2 either way.

## 6. Onboarding (desktop handoff)

1. Sign up in the PWA (mobile or desktop); pick handle → user is 9-kyū, level 1.
2. PWA shows QR/link → desktop setup page (authenticated via short-lived token in the link).
3. Desktop page: pick provider → shows the exact base-URL + header snippet for their SDK/framework (per-framework tabs: raw curl, Python, TS, LangChain, …) + their Kaiden key.
4. Page holds a live connection (SSE) waiting for the first event through the gateway → the moment it lands, both desktop page and phone light up with first XP. Target: level 2 before the session ends.

## 7. Notifications

Web push via service worker. Streak-at-risk is a timezone-aware cron sweep (users whose local time is ~20:00 with no activity today). Level-up and achievement pushes fire from the XP engine's outputs.

## 8. Deliberately deferred

- Native app (Expo) — revisit when Phase 2 feed ships.
- Season length, kyū/dan ↔ level exact mapping — decide during M2 calibration.
- Achievement list v1 — candidates in build plan, finalize in M2.
- Hosting final call — M4.
- Additional providers beyond Anthropic + OpenAI (the two prove the pattern; each addition is a route + usage-parser pair).
