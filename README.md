# Kaiden

Strava for AI users — point your AI SDKs at the Kaiden gateway, earn XP, climb the kyū/dan ranks, share what you build.

**Docs:** [product brief](kaiden-product-brief.md) · [architecture](docs/architecture.md) · [build plan](docs/build-plan.md) — currently at **M0** (skeleton).

## Prerequisites

- Node 22+ (24 recommended — see `.nvmrc`)
- pnpm 10 (`corepack enable` if you don't have it)
- Docker (local Postgres)

## Quickstart (no Docker)

```sh
pnpm install
DATABASE_URL=pglite://.data/dev DEV_EMBED_GATEWAY=1 pnpm --filter @kaiden/api dev   # api + gateway on :4000
pnpm --filter @kaiden/web dev                                                       # web on :3000
```

Open http://localhost:3000 → sign up → Connect → run a snippet → watch the XP land.

## Quickstart (Postgres)

```sh
pnpm install
cp .env.example .env
docker compose up -d   # Postgres on :5433 (5433 on purpose — avoids any system Postgres)
pnpm db:migrate
pnpm dev
```

| Service | URL |
|---|---|
| web (Next.js PWA) | http://localhost:3000 |
| api | http://localhost:4000/healthz |
| gateway | http://localhost:4100/healthz |

## Workspace map

```
apps/
  gateway/     # the proxy — tiny, boring, in the user's critical path; owns the privacy test suite
  api/         # product API: auth, profiles, stats, onboarding
  web/         # Next.js PWA: onboarding, stats, share cards
packages/
  xp-engine/   # pure functions: (events, state, config) → ledger entries
  xp-config/   # ALL XP constants, level curve, ranks, achievements — the only place numbers live
  db/          # Drizzle schema + migrations
  shared/      # types shared across apps
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | run all apps in parallel |
| `pnpm lint` / `pnpm lint:fix` | Biome check / autofix |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm test` | all tests, including the gateway privacy suite |
| `pnpm db:generate` | generate a migration from schema changes |
| `pnpm db:migrate` | apply migrations to `DATABASE_URL` |

## Hard rules

See [CLAUDE.md](CLAUDE.md): metadata only (never prompt/response content), provider keys never stored, XP constants only in `packages/xp-config`, the XP ledger is append-only and non-negative.
