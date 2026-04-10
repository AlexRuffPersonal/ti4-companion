# Phase 2: Session Creation & Lobby — Design Spec

**Date:** 2026-04-11
**Status:** Approved for implementation planning

---

## Overview

Build the game creation, joining, and lobby flow. Phase 2 ends when a host can create a game, share a link, players can join and pick factions/colors, the host configures settings and sets the speaker, and "Start Game" transitions everyone into an in-game placeholder screen.

All players must be authenticated via magic link. Map building is deferred to a later phase.

---

## 1. Routing & Screens

Four new routes replace the current placeholders:

| Route | Screen | Who sees it |
|---|---|---|
| `/setup` | Create/Join screen | Any authenticated user |
| `/join/:code` | Auto-join redirect | Any authenticated user |
| `/lobby/:code` | Lobby | All players in the game |
| `/game/:code` | In-game placeholder | All players after game starts |

**Flow:**
1. Host goes to `/setup` → clicks **Create Game** → lands at `/lobby/ABC123`
2. Host shares `/join/ABC123` URL (or the 6-char code)
3. Players opening the link are auto-joined and land at `/lobby/ABC123`
4. Players entering the code manually go to `/setup` → enter code → same redirect
5. When the host starts the game, all connected clients navigate to `/game/ABC123` simultaneously via Realtime

`/lobby/:code` and `/game/:code` are guarded by `ProtectedRoute`. A user not in `game_players` for that game is redirected to `/setup`.

---

## 2. Edge Functions

Six new functions, all following the Phase 1 pattern (`requireAuth`, `corsPreflightResponse`, `corsHeaders`). All are added to `edgeFunctions.js` as typed wrappers via `callFunction`.

| Function | Caller | What it does |
|---|---|---|
| `game-create` | Host | Generates unique 6-char room code server-side, inserts `games` row (`status='lobby'`, `phase='strategy'`), inserts host's `game_players` row |
| `game-join` | Any player | Validates: code exists, `status='lobby'`, player not already in game, seat available (≤8 players); inserts `game_players` row. Idempotent — if caller already has a row, returns success |
| `game-update-settings` | Host only | Updates `vp_goal`, `expansions`, `permissions_mode` on `games`; rejects if caller is not `host_user_id` |
| `game-pick-faction-color` | Any player in game | Sets `faction` + `colour` on caller's `game_players` row; rejects if faction or color already taken by another player in the same game |
| `game-set-speaker` | Host only | Sets `speaker_player_id` on `games`; validates target player is in the game |
| `game-start` | Host only | Validates: all players have faction + color set, speaker is set; sets `status='active'` |

Room code is generated server-side in `game-create` to avoid client-side collision.

**Note on `games.status`:** The existing migration sets `status TEXT NOT NULL DEFAULT 'active'`. No CHECK constraint exists, so `'lobby'` is a valid new status value with no migration required — `game-create` must explicitly pass `status='lobby'` on insert (not rely on the default).

---

## 3. React Components & Real-Time Sync

### New Components

| Component | Path | Purpose |
|---|---|---|
| `SetupScreen` | `src/components/game/SetupScreen.jsx` | Create game button + join-by-code input; replaces `SetupPlaceholder` in `App.jsx` |
| `LobbyScreen` | `src/components/game/LobbyScreen.jsx` | Player list, faction/color pickers, host settings panel, speaker assignment, Start Game button |
| `GamePlaceholder` | `src/components/game/GamePlaceholder.jsx` | "Game in progress — Phase 3" screen; replaces `DashboardPlaceholder` in `App.jsx` |
| `useGame` | `src/hooks/useGame.js` | Fetches game + players on mount, manages Realtime subscriptions, exposes mutation helpers |

### Real-Time Sync

`useGame` opens two Supabase Realtime subscriptions inside `LobbyScreen`:
1. `games` row for this `game_id` — picks up settings changes and `status` transitions
2. `game_players` rows for this `game_id` — picks up joins, faction/color picks

When `games.status` flips to `'active'`, `useGame` calls `navigate('/game/:code')` for all connected clients simultaneously.

### Faction & Color Data

Available factions and colors are fetched via direct Supabase select from the reference tables (read-only, no Edge Function needed). Options already taken by another player in the same game are shown disabled.

---

## 4. Data Flow & Error Handling

### Optimistic UI

Faction/color picks update local state immediately, then call `game-pick-faction-color`. If the server returns a conflict (another player grabbed it first), the pick is rolled back and an inline error is shown: "Already taken — pick another."

### Join via URL (`/join/:code`)

Three outcomes:
- **Success** → navigate to `/lobby/:code`
- **Already in game** → navigate to `/lobby/:code` (idempotent)
- **Game full / not found / already started** → navigate to `/setup` with an error message in router state

### Reconnection & Rejoin

Since `game_players` rows are permanent (not session-tied):
- A player who disconnects can return and use `/join/:code` again — `game-join` detects their existing row and returns success immediately
- Their faction/color picks are preserved
- If their session expired, `ProtectedRoute` sends them to `/login` first; after re-auth, the same join flow applies
- If the game started while they were disconnected, `game-join` detects `status='active'` and redirects to `/game/:code`

### Lobby Guard

`useGame` checks on load that the current user is in `game_players` for the requested code. Non-members navigating directly to `/lobby/:code` are redirected to `/setup`.

### Start Game

The Start button is disabled client-side if any player has no faction/color set or no speaker is assigned. `game-start` re-validates all conditions server-side before writing — client state is a convenience, not the source of truth.

### Disconnection

Supabase Realtime reconnects automatically. No special handling needed for Phase 2.

---

## 5. Testing

Vitest + @testing-library/react, mocking Supabase at the module boundary — same pattern as Phase 1.

### React Unit Tests

- `SetupScreen` — create button calls `game-create` wrapper; join input validates non-empty code; error states render correctly
- `LobbyScreen` — host sees settings panel, non-host does not; Start button disabled when preconditions unmet; faction/color conflict rolls back optimistic update and shows inline error
- `useGame` — Realtime subscription navigates to `/game/:code` when status flips to `'active'`; lobby guard redirects non-members to `/setup`

### Edge Function Unit Tests

- `game-create` — generates unique code, rejects unauthenticated
- `game-join` — idempotent for existing member; rejects full game (>8 players); rejects non-lobby games; rejects unknown code
- `game-pick-faction-color` — rejects duplicate faction within same game; rejects duplicate color within same game
- `game-start` — rejects if any player missing faction or color; rejects if no speaker set; rejects non-host caller

No integration tests (same decision as Phase 1).

---

## 6. File Map

**Modified:**
- `ti4-companion-web/src/App.jsx` — add `/join/:code`, `/lobby/:code`, `/game/:code` routes; replace `SetupPlaceholder` and `DashboardPlaceholder` with real components; remove the `/dashboard` placeholder route
- `ti4-companion-web/src/lib/edgeFunctions.js` — add 6 typed wrappers

**Created (Edge Functions):**
- `supabase/functions/game-create/index.ts`
- `supabase/functions/game-join/index.ts`
- `supabase/functions/game-update-settings/index.ts`
- `supabase/functions/game-pick-faction-color/index.ts`
- `supabase/functions/game-set-speaker/index.ts`
- `supabase/functions/game-start/index.ts`

**Created (React):**
- `ti4-companion-web/src/components/game/SetupScreen.jsx`
- `ti4-companion-web/src/components/game/LobbyScreen.jsx`
- `ti4-companion-web/src/components/game/GamePlaceholder.jsx`
- `ti4-companion-web/src/hooks/useGame.js`

**Created (Tests):**
- `ti4-companion-web/tests/components/game/SetupScreen.test.jsx`
- `ti4-companion-web/tests/components/game/LobbyScreen.test.jsx`
- `ti4-companion-web/tests/hooks/useGame.test.js`
