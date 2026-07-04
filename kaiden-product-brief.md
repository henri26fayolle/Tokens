# Kaiden — product brief

**One-liner:** Strava for AI users. Connect your AI usage, earn XP, climb the kyū/dan ranks, and share what you build.

**Status:** Pre-build. This brief captures the vision, product decisions, and MVP scope agreed so far. It is intended as working context for planning and development.

---

## 1. Vision

"AI power user" is becoming an identity the way "runner" or "climber" is. People already screenshot their AI conversations, share workflows, and brag about weekend builds — but that sharing has no home, no score, and no permanent record. Kaiden gives it all three: a progression system (XP, ranks, streaks), a profile that proves your skill, and a social feed built around shared, copyable workflows.

The long-term wedge order:

1. **Phase 1 — Solo.** Connect your AI APIs, earn XP, track streaks and achievements, get shareable "Wrapped"-style cards. Fun with zero network. Solves cold-start.
2. **Phase 2 — Social.** Public profiles, following, feed, leaderboards, showcases with kudos and copies. Peer reaction becomes a second currency (reputation) distinct from XP.
3. **Phase 3 — Commercial.** Reputation becomes a hiring signal; sponsored challenges; workflow marketplace; team/enterprise adoption edition (same engine, different config: team aggregation, private-by-default, admin dashboard, SSO). Do not build now; do not preclude.

## 2. Target user (initial)

Developers and technical tinkerers who use AI through API keys, agents, and tools. They already love stats, streaks, and public profiles (GitHub graph culture). Broader consumers come later; the wedge audience is technical by necessity, since API-level usage is what we can measure.

## 3. Core design principles

- **The work happens on desktop; the game happens on the phone.** Mobile-first app is the social/consumption layer (feed, kudos, stats, notifications). Data capture happens via a desktop-configured gateway.
- **Cap volume, reward consistency, bonus breadth, let humans judge quality.** Never reward raw token volume linearly (Goodhart's law).
- **Two currencies.** XP = effort and consistency (algorithmic). Reputation = community validation (kudos, copies). A high level with low reputation is legible to everyone.
- **Metadata only, never content.** We log timestamps, models, token counts, tool-use flags, turn depth. We never store or read prompt/response content. This is a hard privacy line and a core trust promise.
- **Phones never touch API keys.** Gateway setup is a desktop flow; mobile onboarding hands off via link/QR.
- **All XP constants live in config, not code.** Rebalancing must be a config change. Never retroactively remove earned XP.

## 4. Naming and world

- **App name:** Kaiden — from *menkyo kaiden* (免許皆伝), the license of complete transmission, the highest rank in classical Japanese arts. The brand narrative: the whole app is the journey toward kaiden.
- **Levels:** the kyū/dan ladder. New users start at 9-kyū and climb to 1-kyū, then enter dan ranks (1-dan up to 9-dan). Named titles at the top (e.g. seasonal #1 = Meijin).
- **Waza (技):** the in-app word for a shared workflow/showcase — your signature technique. "Post a waza," "copy his waza."
- **Ippon:** candidate word for a featured/perfect showcase moment (optional, later).
- TODO before launch: trademark and domain search (not yet done); sanity-check rank vocabulary with Japanese speakers for accuracy and respectful usage.

## 5. Measurement architecture

Connecting an API key does not grant usage history from providers. Kaiden works as a **lightweight gateway/proxy** (same pattern as Helicone/OpenRouter/LiteLLM): the user points their API base URL at Kaiden's gateway, calls pass through to Anthropic/OpenAI/etc., and Kaiden records metadata only.

Observable signals, ranked by gameability:

| Signal | Examples | Gameable? |
|---|---|---|
| Volume | tokens, request count | Extremely — never reward linearly |
| Consistency | active days, streaks | Mildly — showing up is the point |
| Behavior breadth | tool use, multi-model, multi-turn depth, new capabilities tried | Hard to fake meaningfully |
| Social outcomes | waza posted, kudos, copies | Self-policing (humans judge) |

## 6. XP economy (v1 draft — all values are config)

**Daily engagement — hard cap ~150 XP/day from usage:**
- Active day (≥1 real session): 30 XP
- Usage XP: log-scaled with request/token activity, capped at 60 XP/day
- Streak bonus: +2 XP × current streak length, capped at +60 — **sits outside the daily cap** so long streaks are never crowded out

**Behavior bonuses — rate-limited, not volume-based:**
- First use of a new model or provider: 40 XP (one-time each)
- Multi-provider day: 25 XP (max once/day)
- Agentic/tool-use session: 20 XP (max once/day)
- Deep session (10+ turns, one thread): 20 XP (max once/day)

**Social XP — uncapped; where whales live (Phase 2):**
- Publish a waza: 100 XP
- Kudos received: 5 XP each, decaying after the first 100 per post
- Waza copied by another user: 15 XP each

Net effect: a bot farming requests tops out ~150 XP/day; a genuine enthusiast who ships and shares earns 500+.

## 7. Level curve

- XP required to reach level L ≈ `200 × L^1.6` (base and exponent are config).
- Design targets: level 2 in the first session; a consistent user (~180 XP/day) hits ~level 8–9 in month one and low-20s in year one.
- Map internal levels onto the kyū/dan ladder (e.g. levels 1–9 = 9-kyū…1-kyū, then dan ranks with widening gaps).
- Data model: store **lifetime XP and seasonal XP as separate columns from day one.** Seasons/prestige are the release valve for late-game grind; retrofitting is painful.

## 8. Mobile app (the product surface)

- **Home = feed, not dashboard.** Feed content: waza posts, level-up cards ("Priya reached 1-kyū" with one-tap congratulate), streak milestones.
- **Waza posts carry auto-attached metadata chips** (models used, session length, XP earned) — soft verification that the work is real. Key actions: kudos, comment, **copy workflow** (the single most important button in the app; seeds the Phase 3 marketplace).
- **Posting takes <30 seconds.** The gateway detects notable sessions and pre-drafts the post ("Deep session with Claude today — 42 turns, 2 tools. Share what you built?"). One text field, tap post.
- **Notifications are the retention engine:** level-ups, kudos received, waza copied, streak-at-risk ("your 23-day streak ends at midnight").
- **Share cards render natively in 9:16** for Stories/TikTok, gorgeous in dark mode, subtly branded. Level-up cards and a periodic "Wrapped" summary are the growth loop.
- Tab bar: Feed · Ranks · [+ post] · Stats · Profile.

## 9. Onboarding flow (highest drop-off risk — design carefully)

1. Sign up on mobile (or web).
2. App shows a link/QR to complete gateway setup on desktop, where the user's code and API config live.
3. Desktop flow: swap API base URL to Kaiden gateway (per provider), send a test request.
4. First request through the gateway = first XP = the app lights up. Target: level 2 in session one.

## 10. Anti-gaming and trust

- Volume XP is log-scaled and hard-capped; farming is structurally unprofitable.
- Reputation (kudos, copies) requires other humans and is displayed alongside level.
- Kudos decay per-post blunts viral outliers.
- Metadata-only logging is stated loudly and verifiably in-product.
- Never claw back earned XP during rebalances.

## 11. MVP scope (Phase 1, buildable order)

1. Gateway proxy: Anthropic + OpenAI passthrough, metadata logging, per-user keys/routing.
2. XP engine: event ingestion → XP rules (config-driven) → level/rank computation, streaks, achievements.
3. Accounts and profile: rank, XP bar, streak, stats, achievements.
4. Mobile app (or PWA first): stats view, streak notifications, share-card generation (9:16 export).
5. Instrument everything for the Phase 2 feed (events already shaped as postable moments).

Explicitly out of MVP: feed/following, kudos, waza posting, leaderboards (Phase 2); anything enterprise (Phase 3).

## 12. Open questions

- PWA vs native for v1 mobile (push notifications matter — likely native or at least iOS PWA push).
- Exact kyū/dan ↔ level mapping and season length (quarterly?).
- Achievement list v1 (favor behavioral over volumetric: "3 providers, one project," "shipped after midnight").
- Trademark/domain clearance for Kaiden.
- Legal review of gateway ToS position with each provider.

## 13. Risks

- **Goodhart farming** — mitigated by caps, breadth bonuses, and human-judged reputation; monitor from day one.
- **Cold start** — mitigated by solo-first design and shareable cards; feed ships only when solo loop retains.
- **Privacy backlash** — mitigated by metadata-only architecture and loud transparency.
- **Gateway friction** — the base-URL swap is a real activation hurdle; invest in per-framework setup guides and a one-line SDK wrapper.
- **Hollow gamification** — XP must always trace back to something the user genuinely values (proof of skill, useful copied workflows), not engagement for its own sake.
