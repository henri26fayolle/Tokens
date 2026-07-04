# Kaiden

Strava for AI users: a metadata-only gateway proxy in front of AI provider APIs feeds an XP/rank progression system (kyū/dan ladder) with a social layer to follow.

**Read first:** [kaiden-product-brief.md](kaiden-product-brief.md) (product truth) · [docs/architecture.md](docs/architecture.md) (system design) · [docs/build-plan.md](docs/build-plan.md) (milestones + **current status**).

## Orientation (for a fresh session)

M0–M2 shipped: gateway (apps/gateway) proxies Anthropic/OpenAI and records metadata events; the pure XP engine (packages/xp-engine) turns events into an append-only ledger by full deterministic replay — `computeUser` is the only XP math entry point, and `apps/api/src/xp/processor.ts` is the only writer of xp_ledger. Ledger rule ids and the "1-XP usage rows" determinism trick are documented at the top of packages/xp-engine/src/rules.ts. XP processing is manual for now: `pnpm --filter @kaiden/api xp:process <handle>`. Deploys: push to main → Vercel builds apps/web → kaiden.social. pnpm on this machine only works as `corepack pnpm …` (root-owned ~/.npm cache breaks npm).

## Hard rules (from the brief — never trade these away)

- **Metadata only, never content.** No prompt/response bodies stored, logged, or inspected beyond structured usage fields. Provider API keys pass through the gateway and are never persisted. Phones never touch API keys.
- **All XP constants live in `packages/xp-config`, never in engine code.** Rebalancing is a config change.
- **Never claw back earned XP.** The `xp_ledger` is append-only with non-negative amounts.
- **Never reward volume linearly.** Usage XP is log-scaled and hard-capped (~150/day); uncapped XP only ever comes from human-judged social outcomes.

## Stack (see architecture.md §1)

TypeScript monorepo (pnpm workspaces): Fastify gateway + Fastify API + Next.js PWA, Postgres + Drizzle, better-auth, web push, satori share cards.

## Phase discipline

MVP = Phase 1 (solo) only. No feed, kudos, waza posting, or leaderboards yet — but shape events as postable `moments` so Phase 2 drops in. Don't build Phase 3, don't preclude it.
