# TI4 Companion — Design Decisions

Decisions made during initial architecture brainstorm. Reference this before making any structural changes.

---

## Platform

**React (web) + Flutter (mobile) + Supabase (shared backend)**

- React 18 + Vite + Tailwind CSS for web (desktop/laptop browsers)
- Flutter/Dart + Riverpod + Freezed for iOS and Android
- Both share the same Supabase PostgreSQL + Realtime backend
- Flutter web is excluded — too immature for complex game UIs

---

## Architecture Pattern — Hybrid

Complex game mutations go through **Supabase Edge Functions** (TypeScript/Deno). Simple, high-frequency, reversible state stays **client-side**.

### Goes through Edge Functions (server-side)
Anything that touches VP, decks, permanent game state, or permissions:
- Phase advance, round advance, speaker assignment
- VP adjustment, score objective (public or secret)
- Custodians claim, agenda draw, vote cast, agenda resolve, law enact/repeal
- Technology toggle, planet claim/exhaust/ready, attachment
- Unit placement/movement, combat resolution
- Relic gain/exhaust/purge, action card draw/play
- Trade transaction log, promissory note transfer
- Draft picks, expedition slice claims, The Fracture trigger
- System activation (tactic token placement)
- All admin data entry (tiles, cards, factions, etc.)
- Permissions grant/revoke

### Stays client-side
High-frequency counters and reversible display state:
- Command token pool adjustments (fleet, strategy)
- Commodities, trade goods counters
- Strategy card assignment and passed toggle
- Leader status cycling
- Map tile placement (setup only)
- Tab/overlay navigation, expand/collapse UI

---

## Authentication

**Passwordless — magic link / OTP via email**

- Supabase Auth manages the flow
- No passwords to forget; works well on mobile
- User identity is **permanent** — `user_id` (Supabase UUID) links to every player slot
- Replaces the old `browserId` hack entirely
- Rejoining a game with the same room code reconnects to your player slot automatically
- Game history, stats, and win records tied to account

---

## Database

**Normalized PostgreSQL** — no single JSONB blob.

Permissions are enforced by **Row Level Security (RLS)** at the database level, not just in the UI.

### Command tokens
- `command_tokens = {tactic_total, fleet, strategy}` on `game_players`
- `tactic_total` = tokens owned (pool + any currently on the board)
- Fleet and strategy remain as simple counts (never placed on tiles)
- `game_system_activations` tracks which systems a player has activated (tactic tokens on the map)
- Available tactic tokens = `tactic_total − COUNT(activations this round)`
- CHECK constraint: `tactic_total + fleet + strategy <= 16`
- Edge Functions validate this before every token gain

### Mahact command token capture
- `tokens_lost_to_mahact INTEGER` on victim's `game_players` row
- `tokens_captured_from JSONB` on Mahact's `game_players` row — `{player_id: count}`
- `token_owner_id` on `game_system_activations` — differs from `player_id` when Mahact uses captured tokens
- Both players remain individually subject to the 16-token CHECK constraint

### Space areas
- Not a separate entity — represented implicitly in `game_player_units`
- `on_planet = null` means the unit is in the space area of that system
- `on_planet = "Planet Name"` means the unit is on that planet
- System-level special state (ion storms, frontier tokens, etc.) lives in `game_system_state`

### Co-existing in systems
- `game_player_units` rows are per-player, so multiple players in the same `system_key` is natural
- `combat_active BOOLEAN` on `game_system_state` distinguishes active combat from peaceful coexistence/transit

---

## Data Entry — Admin UI

Reference data (tiles, action cards, factions, technologies, objectives, relics, etc.) is entered manually through a **protected admin UI** within the app.

- `profiles.is_admin = true` gates access
- Allows adding new expansion content without code deployments
- Validated by Edge Functions before writing to the database

---

## Implementation Strategy

**Architect for the full feature set now, implement in phases.**

The schema and Edge Function contracts are designed for everything. The UI is built incrementally — core features first, gameplay depth second. Nothing needs to be redesigned as features are added.

---

## UAT

Semi-regular user acceptance testing after significant updates. Each UAT session will include a provided checklist of features to test.
