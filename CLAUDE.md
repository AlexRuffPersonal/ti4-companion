# CLAUDE.md

Guidance for Claude Code when working in this repository.

Before asking to move on to another section, consider whether the next step would be achieved with lower token usage by starting a new Claude chat. If so, please instruct the user to start a new chat and provide the prompt to be used.

---

## Project Overview

**TI4 Companion** — digital companion app for Twilight Imperium 4th Edition. Tracks game state in real time across a shared session for up to 8 players.

**Platforms:**
- `ti4-companion-web/` — React 19 + Vite + Tailwind CSS 3 (web)
- `ti4-companion/` (future) — Flutter/Dart + Riverpod + Freezed (iOS/Android)
- `supabase/` — shared backend: PostgreSQL + Realtime + Edge Functions (Deno/TypeScript)

**Phase status:** Phases 0–10 are complete (infrastructure through space combat). Ground combat (Phase 11) is in progress. Strategy Cards & Production (Phase 12) is planned. Current feature status and all spec files are tracked in `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`.

---

## Architecture

### Hybrid Client/Server Mutation Model

Complex game mutations go through **Supabase Edge Functions** (TypeScript/Deno). Simple, reversible state is managed **client-side**.

**Edge Functions:** VP, decks, permanent game state, permissions — phase/round advance, objective scoring, agenda draw/vote/resolve, technology toggle, unit placement/combat, relic/action card draw, trade, draft picks, permissions.

**Client-side:** Command token pool display, commodities/trade goods counters, strategy card assignment, leader status cycling, map tile placement (setup only), tab/overlay navigation.

### Authentication

Passwordless — magic link/OTP via Supabase Auth. `user_id` = permanent Supabase UUID. Same room code → same player slot. No `browserId` hacks.

### Database

Normalized PostgreSQL (31 tables: 19 game state + 12 admin reference). RLS enforced at DB level.

**Key game state tables:**
- `games` — phase, round, vp_goal, map_tiles (JSONB), expansions, speaker
- `game_players` — vp, command_tokens (JSONB `{tactic_total, fleet, strategy}`), technologies (TEXT[]), leaders (JSONB)
- `game_system_state` — lazily created, keyed by axial coord `"q,r"`; ion storms, wormholes, combat
- `game_system_activations` — tactic tokens on map; available = `tactic_total − COUNT(activations this round)`
- `game_player_units` — units per system per player; `on_planet = null` means space area

**Constraints:**
- `tactic_total + fleet + strategy <= 16` (CHECK constraint)
- Mahact token capture: victim's `tokens_lost_to_mahact` + Mahact's `tokens_captured_from` JSONB; `token_owner_id` differs from `player_id` on activations rows when Mahact uses a captured token

**Admin reference data** (tiles, factions, agendas, etc.) entered via admin UI gated by `profiles.is_admin`.

---

## React Web App (`ti4-companion-web/`)

### Tech Stack

React 19, Vite, Tailwind CSS 3, Supabase JS v2, react-router-dom v7, Vitest 4, @testing-library/react, lucide-react

### Design Tokens (Tailwind)

Defined in `tailwind.config.js`:
- **Colors:** `void`, `hull`, `panel`, `border`, `muted`, `dim`, `text`, `bright`, `gold`, `plasma`, `danger`, `warning`, `success`
- **Fonts:** `font-display` (Orbitron), `font-body` (Rajdhani), `font-mono` (Space Mono) — Google Fonts in `index.html`
- **Utility classes:** `.panel`, `.panel-inset`, `.label`, `.btn-primary`, `.btn-ghost`, `.input`, `.counter-btn`

### Key Files

**Auth & routing:**
- `src/App.jsx` — router + auth gate; routes: `/login`, `/setup`, `/join/:code`, `/lobby/:code`, `/game/:code`, `/admin`, `/admin/import/:table`
- `src/hooks/useAuth.js` — session state + magic link send/verify
- `src/components/auth/LoginScreen.jsx`, `VerifyScreen.jsx`
- `src/components/shared/ProtectedRoute.jsx` — redirects to `/login` if no session
- `src/components/admin/AdminRoute.jsx` — redirects if not `is_admin`

**Admin:**
- `src/components/admin/AdminDashboard.jsx` — lists 12 import tables
- `src/components/admin/AdminImportPage.jsx` — JSON paste form for bulk import
- `src/components/admin/ImportSchemaPanel.jsx` — schema reference panel (always visible)
- `src/lib/importSchemas.js` — field descriptors for all 12 import tables (keyed by URL slug)

**Lobby/game:**
- `src/components/game/SetupScreen.jsx` — create or join game by code
- `src/components/game/LobbyScreen.jsx` — faction/colour picker, host controls, Start Game
- `src/components/game/GamePlaceholder.jsx` — Phase 3 stub
- `src/hooks/useGame.js` — fetches game + players, Realtime subscription, action wrappers

**Shared lib:**
- `src/lib/supabase.js` — Supabase client singleton; throws if env vars missing
- `src/lib/edgeFunctions.js` — typed wrappers for Edge Function calls via `callFunction(name, body)`

### Commands (run from `ti4-companion-web/`)

```bash
npm run dev          # Vite dev server
npm run build        # production build
npm test             # vitest run (all tests)
npm run test:watch   # vitest watch mode
npx vitest run tests/lib/supabase.test.js  # single file
```

### Environment Variables

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

---

## Supabase (`supabase/`)

**Migrations:** `001_core.sql` through `027_combat.sql` (ground combat adds `028_ground_combat.sql`)

**Edge Functions:**
- `_shared/` — `auth.ts`, `db.ts`, `errors.ts`
- `health/` — health check
- `admin-import-{tiles,factions,agendas,technologies,units,public-objectives,secret-objectives,action-cards,relics,exploration-cards,attachments,promissory-notes}/` — 12 bulk import functions
- `game-create`, `game-join`, `game-update-settings`, `game-pick-faction-color`, `game-set-speaker`, `game-start` — lobby
- `game-end-turn`, `game-advance-phase`, `game-player-pass` — turn flow
- `game-research-technology`, `game-draw-action-card`, `game-discard-action-card` — action phase
- `game-resolve-ability`, `game-unlock-commander` — ability system
- `game-status-phase`, `game-reveal-objective`, `game-score-objective`, `game-score-secret-objective`, `game-discard-secret-objective` — status phase
- `game-draw-agenda`, `game-cast-votes`, `game-resolve-agenda` — agenda phase
- `game-create-transaction`, `game-confirm-transaction`, `game-reject-transaction`, `game-rescind-transaction`, `game-play-promissory-note` — trade
- `game-activate-system`, `game-land-troops`, `game-update-command-tokens`, `game-shuffle-deck` — map / actions
- `game-fire-space-cannon`, `game-roll-combat-dice`, `game-assign-hits`, `game-declare-retreat` — space combat

**Deploy:** Always include `--no-verify-jwt` (project uses ES256 JWTs):
```bash
supabase functions deploy <function-name> --no-verify-jwt
```

---

## Deferred Features

When a feature is deferred, add it to `POTENTIAL_TODOS.md` at the project root. When brainstorming or planning new phases, ask: "Should I add [feature] to the Potential To-Do list?" before moving on.

---

## Feature Specs

All spec files live in `ti4-companion-web/docs/superpowers/plans/main_plan/`.

**Before implementing any feature:**
1. Read `main_plan/_standards.md` — defines shorthand tokens used in all spec files
2. Check `main_plan/_index.md` — find the spec file(s) for the feature you're building and their prerequisites
3. Read the relevant spec file(s) — each covers one actual file (functionality pseudo-code + test pseudo-code)

**When completing a feature:** update the `Status` column in `main_plan/_index.md` from `in-progress` → `done`.

**When planning a new feature** — this happens during the planning/brainstorming session, not during implementation:
1. Add a row to `main_plan/_index.md` with status `planned` and its dependencies
2. Create a spec file per new/modified file in `main_plan/` using the format in existing spec files
3. Use tokens from `main_plan/_standards.md`; add new tokens there if a pattern will recur
4. Commit the spec files and `_index.md` update together with the implementation plan

**IMPORTANT:** Never leave "create main_plan spec files" or "update _index.md" as a task inside an implementation plan. These must be done by the time the plan is committed. An implementation plan that defers its own spec files to Task 1 is incomplete.

**Spec file format** (keep files short — pseudo-code only, no full implementations):
```markdown
# component-or-fn-name
**File:** `path/to/actual/file`
**Status:** New | Modify
**Prereqs:** comma-separated spec file names

## Functionality
[pseudo-code using _standards.md tokens]

## Tests
[pseudo-code test scenarios using _standards.md tokens]
```

---

## Design Decisions

Documented in `ti4-companion/docs/design/decisions.md`. Key principles:
- Schema and Edge Function contracts are designed for the **full feature set** now; UI is built incrementally.
- Flutter web is excluded — too immature for complex game UIs.
- `permissions_mode` on `games`: `host` (only host can mutate) or `all` (any player can).
- Expansions tracked as `{base, pok, te}` JSONB on `games`.
