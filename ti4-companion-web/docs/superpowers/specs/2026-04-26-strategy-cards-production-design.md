# Strategy Cards & Production — Design

**Date:** 2026-04-26
**Phase:** 12
**Status:** Approved

---

## Overview

Two interrelated systems built together because Construction (strategy card 4) places space docks, and space docks are the primary production source.

**Strategy Cards:** Full automation of all 8 cards. Each card's effects are encoded as `ability_definitions` rows (same DSL as faction abilities/action cards). A new sequencing layer (`game_strategy_card_plays` + `game_strategy_card_responses`) handles the multi-player secondary flow in clockwise order from the active player.

**Production:** Full enforcement — players exhaust planets to fund unit production; app validates resource total ≥ unit costs and unit count ≤ production capacity. Capacity is summed from the `production` stat of all production-capable units the caller has in the active system.

---

## Architecture

### New DB Tables

**`game_strategy_card_plays`**
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
game_id             UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE
card_number         INTEGER NOT NULL
played_by_player_id UUID NOT NULL REFERENCES game_players(id)
round               INTEGER NOT NULL
status              TEXT NOT NULL DEFAULT 'active'  -- 'active' | 'complete'
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

**`game_strategy_card_responses`**
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
play_id          UUID NOT NULL REFERENCES game_strategy_card_plays(id) ON DELETE CASCADE
player_id        UUID NOT NULL REFERENCES game_players(id)
initiative_order INTEGER NOT NULL  -- clockwise distance from active player's seat_index
status           TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'used' | 'passed'
responded_at     TIMESTAMPTZ
```

### Schema Changes to `game_player_planets`

```sql
-- Replace has_space_dock BOOLEAN with typed FK (enables production stat lookup)
ALTER TABLE game_player_planets
  DROP COLUMN has_space_dock,
  ADD COLUMN space_dock_unit_id UUID REFERENCES units(id);  -- null = no space dock

-- Replace has_pds BOOLEAN with count (LRR 63.3: max 2 PDS per planet)
ALTER TABLE game_player_planets
  DROP COLUMN has_pds,
  ADD COLUMN pds_count INTEGER NOT NULL DEFAULT 0;
```

### Strategy Card Definitions in `ability_definitions`

Each strategy card gets two `ability_definitions` rows (primary + secondary), with `ability_sources` rows where `source_type = 'strategy_card'` and `source_id = card_number::text`. Admin-imported — no new reference table needed.

### New DSL Ops in `abilityDsl.ts`

| Op | Effect |
|----|--------|
| `spend_strategy_token` | Decrement `command_tokens.strategy` by 1 |
| `replenish_commodities` | Set `commodities` to faction max; `target: 'self'` or `target: 'chosen_player'` |
| `place_structure` | Set `space_dock_unit_id` or increment `pds_count` on chosen planet; validates max limits (1 SD, 2 PDS per planet); `choices: ['pds', 'space_dock']` or locked to `'pds'` |
| `ready_planets` | Un-exhaust up to `amount` of caller's exhausted planets (chosen by caller) |
| `gain_trade_goods` | Increment `trade_goods` by `amount` |
| `set_speaker` | Update `games.speaker_player_id` to chosen player |
| `peek_agenda` | Return top N agenda deck cards for client-side reordering; caller sends back desired order in `selections`; `game-resolve-ability` applies it by updating `deck_position` on `game_agenda_deck` rows |
| `draw_action_card` | Draw 1 card from action card deck into caller's hand |
| `score_imperial_point` | +1 VP if caller controls Mecatol Rex (`system_key = '0,0'`) |
| `draw_secret_objective` | Draw top secret objective into caller's hand |

**Existing ops reused:**
- Leadership primary/secondary: `gain_command_tokens` (already exists)
- Technology primary/secondary: routes to `game-research-technology` logic

---

## Strategy Card Sequencing

### State Machine

```
[action phase — caller's turn]
        ↓
game-play-strategy-card
  → resolves primary effect via ability DSL
  → creates game_strategy_card_plays row (status: 'active')
  → creates game_strategy_card_responses rows for all other players
    ordered by clockwise seat distance:
    initiative_order = (their seat_index - active_seat_index + player_count) % player_count
        ↓
[player with initiative_order = 1 sees secondary option]
        ↓
game-use-strategy-secondary  OR  game-pass-strategy-secondary
  → validates caller is the next 'pending' row (min initiative_order where status = 'pending')
  → applies secondary effect via ability DSL (if used)
  → marks response 'used' or 'passed'
  → if all responses resolved → marks play 'complete'
        ↓
[repeat for each remaining player in clockwise order]
        ↓
[play complete — active player proceeds to end turn]
```

### Enforcement Rules

- Only `game.active_player_id` can call `game-play-strategy-card`
- `strategy_card` on the caller's `game_players` row must match `card_number`
- A play row with `status = 'active'` for this game + round already existing = 409
- Only the next `pending` player in clockwise order can call use/pass — others get 409
- Card holder cannot use their own secondary
- `game-end-turn` auto-passes all remaining `pending` responses and marks play `complete`

### Realtime

- Clients subscribe to `game_strategy_card_plays` filtered by `game_id`
- Clients subscribe to `game_strategy_card_responses` filtered by `play_id` (set when play becomes active)
- Play row change → triggers secondary panel for all other players
- Response row change → updates response status list in `StrategyCardModal`

---

## Production System

### `game-produce-units` Edge Function

**Request body:**
```typescript
{
  game_id: string
  system_key: string
  units: { unit_type: string; count: number; on_planet?: string }[]
  // on_planet required for ground forces (LRR 68.3)
  planet_exhausts: string[]
}
```

**Behaviour:**
1. `AUTH` + `BODY` + `PLAYER` + `GAME`
2. `ACTIVE_PLAYER`
3. `ACTIVATION(system_key)` — system must be activated this round
4. Fetch all caller's units in `system_key`; join `units` reference table; parse and sum `production` stats → `totalCapacity`; ERR 409 if `totalCapacity === 0`
5. ERR 409 if `sum(units[].count) > totalCapacity`
6. Fetch `planet_exhausts` from `game_player_planets`; sum resource values from `tiles.planets` JSONB; ERR 409 if total resources < sum of unit costs (`units.cost`)
7. ERR 409 if any ship unit produced and system contains other players' ships (LRR 67.6)
8. ERR 409 if `on_planet` missing for ground force units
9. Exhaust `planet_exhausts` planets (`exhausted = true`)
10. Upsert each produced unit into `game_player_units` (increment `count` or insert)
11. Return `{ produced: true }`

---

## New Edge Functions

| Function | Purpose |
|----------|---------|
| `game-play-strategy-card` | Execute primary; create play + response rows |
| `game-use-strategy-secondary` | Validate turn order; execute secondary via DSL; mark response |
| `game-pass-strategy-secondary` | Validate turn order; mark response passed |
| `game-produce-units` | Validate capacity + resources; exhaust planets; place units |

**Modified Edge Functions:**
- `game-resolve-ability` — add new DSL ops; add `source_type: 'strategy_card'` handling
- `game-end-turn` — auto-pass pending secondary responses before advancing turn

---

## UI Components

### New Components

**`StrategyCardPanel`** (replaces strategy card display in `MyPanelSection`)
- Strategy phase: shows available cards; player taps to pick
- Action phase, caller's turn: "PLAY STRATEGY CARD" button → opens `StrategyCardModal`
- Action phase, another player's card active: opens `StrategyCardModal` automatically via Realtime

**`StrategyCardModal`**
- Card holder view: card name + primary text; list of other players with response status in clockwise order; "CLOSE" when done
- Next-to-respond view: secondary ability text + cost; "USE SECONDARY" and "PASS" buttons
- Waiting view: "Waiting for [player name]…"
- Auto-dismisses when play `status = 'complete'`

**`ProductionModal`**
- Opened from `SystemActionModal` when active system contains caller-owned space dock
- Shows total production capacity (summed from unit production stats)
- Unit picker with +/− counters; running capacity and resource totals
- Planet exhaust picker: unexhausted planets with resource values; tap to toggle
- Ground force planet placement picker (planets in system with production units)
- "PRODUCE" disabled until unit count ≤ capacity and resources ≥ cost

### Modified Components

- `SystemActionModal` — add "PRODUCE UNITS" button when applicable
- `MyPanelSection` — replace strategy card display with `StrategyCardPanel`
- `GameScreen` — subscribe to `game_strategy_card_plays`; pass active play to `StrategyCardModal`

---

## Testing

### Edge Function Tests

- `game-play-strategy-card.test.js` — auth/body/player guards; 409 if card not held by caller; 409 if play already active this round; primary effect applied; response rows created in correct clockwise order; play status = 'active'
- `game-use-strategy-secondary.test.js` — auth/body/player guards; 409 if no active play; 409 if caller is card holder; 409 if not next in clockwise sequence; secondary effect applied; response marked 'used'; play marked 'complete' when all responded
- `game-pass-strategy-secondary.test.js` — same guards; 409 if not next in sequence; response marked 'passed'; play marked 'complete' when last
- `game-produce-units.test.js` — auth/body/player/active/activation guards; 409 if no production units in system; 409 if count exceeds capacity; 409 if resources insufficient; 409 if ships in enemy-occupied system; 409 if ground forces missing on_planet; planets exhausted correctly; units upserted correctly

### Component Tests

- `StrategyCardModal.test.jsx` — card holder view; next-to-respond view; waiting view; use/pass callbacks; auto-dismiss on complete
- `ProductionModal.test.jsx` — correct capacity display; produce disabled when over capacity; produce disabled when resources short; correct payload on submit

---

## Spec Files to Create/Update

The following spec files will be added to `specs/_index.md` as `planned`:

| Spec File | File | Status |
|-----------|------|--------|
| `migration-029-strategy-production` | `supabase/migrations/029_strategy_production.sql` | New |
| `fn-game-play-strategy-card` | `supabase/functions/game-play-strategy-card/index.ts` | New |
| `fn-game-use-strategy-secondary` | `supabase/functions/game-use-strategy-secondary/index.ts` | New |
| `fn-game-pass-strategy-secondary` | `supabase/functions/game-pass-strategy-secondary/index.ts` | New |
| `fn-game-produce-units` | `supabase/functions/game-produce-units/index.ts` | New |
| `fn-game-resolve-ability` | `supabase/functions/game-resolve-ability/index.ts` | Modify |
| `fn-game-end-turn` | `supabase/functions/game-end-turn/index.ts` | Modify |
| `shared-abilityDsl` | `supabase/functions/_shared/abilityDsl.ts` | Modify |
| `client-edgeFunctions` | `src/lib/edgeFunctions.js` | Modify |
| `component-StrategyCardPanel` | `src/components/game/StrategyCardPanel.jsx` | New |
| `component-StrategyCardModal` | `src/components/game/StrategyCardModal.jsx` | New |
| `component-ProductionModal` | `src/components/game/ProductionModal.jsx` | New |
| `component-SystemActionModal` | `src/components/game/SystemActionModal.jsx` | Modify |
| `component-MyPanelSection` | `src/components/game/MyPanelSection.jsx` | Modify |
| `component-GameScreen` | `src/components/game/GameScreen.jsx` | Modify |
