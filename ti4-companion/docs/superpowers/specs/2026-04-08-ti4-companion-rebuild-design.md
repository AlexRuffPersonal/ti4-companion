# TI4 Companion — Full Rebuild Design Spec

**Date:** 2026-04-08
**Status:** Approved for implementation planning

---

## Overview

A complete ground-up rebuild of the TI4 Companion app. The existing React codebase is replaced with a new, properly architected system designed to support the full Twilight Imperium 4th Edition ruleset (base + Prophecy of Kings + Thunder's Edge) across web and native mobile platforms.

---

## 1. Platform

| Target | Frontend | Rationale |
|---|---|---|
| Web (desktop/laptop) | React 18 + Vite + Tailwind CSS | Best for complex interactive UIs |
| iOS + Android | Flutter/Dart + Riverpod + Freezed | True native performance, app store distribution |
| Backend (shared) | Supabase (PostgreSQL + Realtime + Auth + Edge Functions) | Single source of truth for both frontends |

Flutter web is excluded — too immature for complex, data-heavy game UIs.

---

## 2. Architecture

**Hybrid pattern:** complex game mutations go through Supabase Edge Functions (TypeScript/Deno); simple, high-frequency, reversible state is handled client-side.

### Goes through Edge Functions (server-side)
Anything touching VP, decks, permanent game state, or permissions:
- Phase advance, round advance, speaker assignment
- VP adjustment, score public/secret objective
- Custodians claim, agenda draw, cast vote, resolve agenda, enact/repeal law
- Technology toggle, planet claim/exhaust/ready, attachment add
- Unit placement/movement/removal, initiate/resolve combat
- Action card draw/play, relic gain/exhaust/purge/transfer
- Exploration card resolve, relic fragment combine
- Trade transaction log, promissory note give/play/return
- System activation (tactic token placement)
- Draft picks, expedition slice claim, The Fracture trigger
- Grant/revoke edit permission
- All admin data entry (tiles, cards, factions, objectives, etc.)

### Stays client-side
High-frequency counters and reversible display state:
- Fleet and strategy command token pool adjustments
- Commodities and trade goods counters
- Strategy card assignment and passed toggle
- Leader status cycling
- Map tile placement (setup phase only, host only)
- Tab/overlay navigation, expand/collapse UI state

### Edge Function contract
Both frontends call the same Edge Functions with the same typed payloads. The Edge Function contract is the shared interface — an action that works on web works on mobile by definition. Wrappers:
- `src/lib/edgeFunctions.js` (React)
- `lib/services/edge_functions.dart` (Flutter)

---

## 3. Authentication

**Passwordless — magic link / OTP via email** (Supabase Auth).

- No passwords — simpler UX, works well on mobile
- User identity is permanent: `user_id` (Supabase UUID) replaces the old `browserId` hack
- `profiles` row auto-created on first login
- Rejoining a game with the same room code reconnects to the player's slot via `user_id`
- Game history, stats, and win records are tied to the account permanently
- Guest slots supported: `game_players.user_id` is nullable for players who join without an account

---

## 4. Database

Fully normalized PostgreSQL — no single JSONB blob. RLS enforced on all tables.

See `docs/design/schema.md` for the complete schema (19 game state tables + 12 admin-entered reference tables).

### Key design decisions

**Permissions:** `game_players.can_edit_all BOOLEAN` replaces the broken `slot-N` key hack. RLS policies enforce this at the database level — it is not UI-only.

**Command tokens:**
- `command_tokens = {tactic_total, fleet, strategy}` on `game_players` — totals owned, not available counts
- `tactic_total` includes tokens both in the pool and currently on the board
- `game_system_activations` tracks tactic tokens placed on the map (one row per activation)
- Available tactic tokens derived: `tactic_total − COUNT(activations this round)`
- Fleet and strategy never leave the player sheet — stored as simple counts
- CHECK constraint: `tactic_total + fleet + strategy <= 16`
- Edge Functions validate this before every token gain (belt and suspenders with the constraint)

**Mahact command token capture:**
- `tokens_lost_to_mahact INTEGER DEFAULT 0` on victim's row
- `tokens_captured_from JSONB DEFAULT {}` on Mahact's row — `{player_id: count}`
- `token_owner_id` on `game_system_activations` — differs from `player_id` when Mahact uses a captured token to activate
- Both players remain individually subject to the 16-token constraint

**Space areas:** represented implicitly in `game_player_units`. `on_planet = null` means the unit is in the space area; `on_planet = "Planet Name"` means on the planet surface. No separate space area entity is needed.

**Co-existing in systems:** `game_player_units` rows are per-player, so multiple players having units in the same `system_key` is natural. `game_system_state.combat_active` distinguishes active combat from peaceful coexistence or transit.

**System state:** `game_system_state` table (one row per system that has notable state, created lazily). Tracks: frontier explored, space station, entropic scar, wormhole active, ion storm, Mirage present, space mines, combat active.

**Reference data in the database:** all game data (tiles, factions, cards, objectives, etc.) lives in the database, not in code. Admin UI allows adding new expansion content without code deployments.

---

## 5. Admin UI

Protected section of the React web app only. Gated by `profiles.is_admin = true` (set manually in Supabase dashboard). All routes additionally protected at the Edge Function level.

**Routes:**
```
/admin/tiles
/admin/factions
/admin/agendas
/admin/technologies
/admin/units
/admin/objectives/public
/admin/objectives/secret
/admin/action-cards
/admin/relics
/admin/exploration-cards
/admin/attachments
/admin/promissory-notes
```

Each page: list of all entries, inline or modal edit form, delete with confirmation. Forms validate against schema before calling Edge Function.

**Manual data entry** by the user happens after Phase 1 is built (see Implementation Phases). All 12 reference table types must be populated before game sessions are playable.

---

## 6. Frontend Structure

### React web — `ti4-companion-web/`
```
src/
  components/
    admin/          — all 12 admin data entry pages
    auth/           — magic link login, OTP, waiting screen
    dashboard/      — scoreboard, phase control, player list
    setup/          — create/join game flow (3-step wizard)
    agenda/         — agenda phase overlay
    map/            — hex map builder
    objectives/     — public/secret objectives panel
    combat/         — combat tracker overlay
    trade/          — trade log
    draft/          — pre-game draft (Milty, snake, random)
    stats/          — game history, win rates
    shared/         — buttons, counters, modals, chips
  hooks/
    useGameState.js — thin: subscribes to Supabase realtime, dispatches to Edge Fns
    useAuth.js
    useAdmin.js
  lib/
    supabase.js         — client singleton
    edgeFunctions.js    — typed wrappers for every Edge Function call
```

`useGameState` is significantly thinner than the current app — no game logic lives in it. It subscribes to realtime updates and calls Edge Functions. All logic lives server-side.

### Flutter mobile — `ti4-companion-mobile/`
```
lib/
  core/
    supabase_service.dart
    theme.dart              — void/plasma/gold colour scheme
    router.dart             — go_router
  models/                   — freezed immutable models (mirroring DB tables)
  providers/                — Riverpod: GameStateNotifier, AuthNotifier
  screens/
    auth/
    setup/
    dashboard/
    agenda/
    objectives/
    combat/
    trade/
    stats/
  widgets/                  — shared Flutter widgets
  services/
    edge_functions.dart     — typed wrappers (mirrors edgeFunctions.js)
```

---

## 7. Implementation Phases

Phases are ordered by dependency. Each phase ends with a UAT checkpoint before the next begins.

| Phase | Output | UAT checkpoint |
|---|---|---|
| **0** | Supabase project, full schema, RLS, auth, Edge Function scaffolding | — |
| **1** | Admin UI (React) + **manual data entry by user** | UAT 1 — data completeness |
| **2** | Web: magic link auth, setup screen, basic dashboard, realtime sync | UAT 2 — core game session |
| **3** | Web: full player tracking, working permissions, trade log | UAT 3 — player tracking |
| **4** | Web: phase advance, agenda phase, map builder | UAT 4 — full game round |
| **5** | Web: public/secret objectives, proper VP scoring | UAT 5 — objectives |
| **6** | Flutter: auth, join game, read-only dashboard, realtime sync | UAT 6 — cross-platform sync |
| **7** | Flutter: fully interactive (all actions at parity with web) | UAT 7 — mobile full play |
| **8** | Planets, units, system activations, board state | UAT 8 — board state |
| **9** | Combat tracker (space + ground) | UAT 9 — combat |
| **10** | Action cards, exploration decks, relics (PoK) | UAT 10 — cards & decks |
| **11** | Pre-game draft system (Milty, snake, random) | UAT 11 — draft |
| **12** | Thunder's Edge deep features (expedition, scars, stations) | UAT 12 — TE |
| **13** | Game history, stats, win records | UAT 13 — stats |

### UAT process
Each UAT checkpoint will include a provided checklist of specific features and scenarios to test. Testing is performed before the next phase begins. Issues found during UAT are fixed before proceeding.

---

## 8. What This Replaces

The existing `ti4-companion/` React app is replaced in full. Nothing from the current codebase is carried forward directly — the architecture, state management pattern, database schema, and auth model are all different. The existing app can be kept running during the rebuild as a reference.

Key bugs in the existing app that are resolved by this design:
- Permissions system (slot-N key mismatch) — fixed by `can_edit_all` + RLS
- `myPlayerId`/`myBrowserId` duplication — replaced by single `user_id`
- Dead exports (`getLeaderWithMostVP`, `getPlayerWithFewestVP`) — removed
- Nav tab active state not resetting after overlay close — fixed by proper routing
- `adjustCounter` guard hack — replaced by typed Edge Function calls
- Agenda deck limited to 50 (BUG #5) — enforced by DB deck size at game creation
- All other inline BUG comments — resolved by proper schema and server-side logic
