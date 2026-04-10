# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**TI4 Companion** is a digital companion app for Twilight Imperium 4th Edition. It tracks game state in real time across a shared session for up to 8 players.

**Platforms:**
- `ti4-companion-web/` — React 19 + Vite + Tailwind CSS (web, desktop/laptop browsers)
- `ti4-companion/` (future) — Flutter/Dart + Riverpod + Freezed (iOS/Android)
- `supabase/` (future) — shared backend: PostgreSQL + Realtime + Edge Functions

Phase 0 (infrastructure) is complete. Phase 1 (Admin UI) is in progress. See `ti4-companion-web/docs/superpowers/plans/` for implementation plans.

---

## Architecture

### Hybrid Client/Server Mutation Model

Complex game mutations go through **Supabase Edge Functions** (TypeScript/Deno). Simple, high-frequency, reversible state is managed **client-side**.

**Goes through Edge Functions:** Anything touching VP, decks, permanent game state, or permissions — phase/round advance, objective scoring, agenda draw/vote/resolve, technology toggle, unit placement/combat, relic/action card draw, trade transactions, draft picks, permissions grant/revoke.

**Stays client-side:** Command token pool display, commodities/trade goods counters, strategy card assignment, leader status cycling, map tile placement (setup only), tab/overlay navigation.

### Authentication

Passwordless — magic link/OTP via Supabase Auth. User identity is permanent (`user_id` = Supabase UUID). Rejoining a game with the same room code reconnects to the same player slot. No `browserId` hacks.

### Database

Normalized PostgreSQL (31 tables total: 19 game state + 12 admin reference). RLS enforced at the database level.

**Key game state tables:**
- `games` — session state: phase, round, vp_goal, map_tiles (JSONB), expansions, speaker
- `game_players` — per-player: vp, command_tokens (JSONB `{tactic_total, fleet, strategy}`), technologies (TEXT[]), leaders (JSONB)
- `game_system_state` — lazily created, keyed by axial coord `"q,r"`; tracks ion storms, wormholes, combat, etc.
- `game_system_activations` — tactic tokens on the map; available tactic tokens = `tactic_total − COUNT(activations this round)`
- `game_player_units` — units per system per player; `on_planet = null` means space area

**Command token constraint:** `tactic_total + fleet + strategy <= 16` enforced by CHECK constraint.

**Mahact token capture:** Victim's `tokens_lost_to_mahact` + Mahact's `tokens_captured_from JSONB`. `token_owner_id` on activations row differs from `player_id` when Mahact uses a captured token.

**Space areas** are implicit — units with `on_planet = null` are in the space area of their `system_key`.

**Admin reference data** (tiles, factions, agendas, action cards, technologies, units, objectives, relics, etc.) is entered manually through a protected admin UI gated by `profiles.is_admin`.

---

## React Web App (`ti4-companion-web/`)

### Tech Stack

React 19, Vite, Tailwind CSS 3, Supabase JS v2, react-router-dom v7, Vitest 4, @testing-library/react

### Design Tokens (Tailwind)

Custom sci-fi color palette and font families defined in `tailwind.config.js`:
- Colors: `void`, `hull`, `panel`, `border`, `muted`, `dim`, `text`, `bright`, `gold`, `plasma`, `danger`, `warning`, `success`
- Fonts: `font-display` (Orbitron), `font-body` (Rajdhani), `font-mono` (Space Mono) — loaded from Google Fonts in `index.html`
- Utility classes: `.panel`, `.panel-inset`, `.label`, `.btn-primary`, `.btn-ghost`, `.input`, `.counter-btn`

### Key Files

- `src/lib/supabase.js` — Supabase client singleton; throws if env vars are missing
- `src/lib/edgeFunctions.js` — typed wrappers for Edge Function calls via `callFunction(name, body)`
- `src/hooks/useAuth.js` — session state + magic link send/verify
- `src/components/auth/` — `LoginScreen.jsx`, `VerifyScreen.jsx`
- `src/components/shared/ProtectedRoute.jsx` — redirects to `/login` if no session
- `src/App.jsx` — router + auth gate

### Environment Variables

Once scaffolded, copy `.env.example` to `.env`:
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### Commands (once scaffolded, run from `ti4-companion-web/`)

```bash
npm run dev          # start Vite dev server
npm run build        # production build
npm test             # run all tests (vitest run)
npm run test:watch   # vitest in watch mode
npx vitest run tests/lib/supabase.test.js   # run a single test file
```

---

## Planned Directory Layout

```
TI4 Companion/
  supabase/
    migrations/
      001_core.sql … 006_rls.sql
    functions/
      _shared/auth.ts, errors.ts, db.ts
      health/index.ts
  ti4-companion-web/     ← React web app
  ti4-companion/         ← Flutter mobile app (future)
```

---

## Deferred Features

When a feature is explicitly deferred, add it to `POTENTIAL_TODOS.md` at the project root. When brainstorming or planning new phases, ask the user: "Should I add [feature] to the Potential To-Do list?" before moving on.

---

## Design Decisions

Documented in `ti4-companion/docs/design/decisions.md`. Reference before making structural changes. Key principles:

- Schema and Edge Function contracts are designed for the **full feature set** now; UI is built incrementally.
- Flutter web is excluded — too immature for complex game UIs.
- `permissions_mode` on `games`: `host` (only host can mutate) or `all` (any player can).
- Expansions tracked as `{base, pok, te}` JSONB on `games`.
