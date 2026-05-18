# Phase 37: Strategy Card Text & Ability Enforcement

**Date:** 2026-05-18
**Phase:** 37
**Feature area:** Strategy Cards — display + full enforcement

---

## Overview

Phase 12 implemented strategy card assignment (picking in the strategy phase) and the response-row flow (USE SECONDARY / PASS modal). It did not implement card-face display or enforce any of the 8 cards' specific primary or secondary effects.

Phase 37 completes the strategy card system:
- All 8 cards show full card-face text (name, initiative, primary text, secondary text) in the UI
- All 8 primaries and secondaries are enforced through the existing DSL + edge function flow
- Complex sub-steps (Diplomacy force-placement, Politics secret agenda peek, Warfare redistribution, Construction structure placement) are fully automated

**Rules basis:** LRR §83 Strategy Card, §84 Strategy Phase, §82 Strategic Action; individual card sections §24 Construction, §32 Diplomacy, §45 Imperial, §52 Leadership, §66 Politics, §91 Technology, §92 Trade, §99 Warfare.

**Prereqs:** Phase 36 (Objective Condition Enforcement) — Imperial primary's public objective scoring delegates to Phase 36's condition checker.

---

## Data Layer

### Migration `047_strategy_card_effects.sql`

1. **Populate `ability_definitions` effects** — The Phase 12 migration seeds `ability_sources` rows for all 8 cards' primaries and secondaries (`source_type = 'strategy_card'`) but leaves the `effects` JSONB empty. This migration populates all 16 effects rows using the new DSL ops defined in Section 2.

2. **New column on `game_strategy_card_plays`:**
   ```sql
   ALTER TABLE game_strategy_card_plays
     ADD COLUMN free_secondary_player_ids UUID[] NOT NULL DEFAULT '{}';
   ```
   Trade card primary designates players who may use the secondary without spending a command token. This column records those IDs so `game-use-strategy-secondary` can enforce the free/paid distinction per LRR §92.4.

3. **No DB table for card text** — Strategy card names, initiative numbers, and ability text are static. They live in `src/lib/strategyCardConstants.js` (client-side only), not the DB.

---

## New DSL Ops (`shared-abilityDsl.ts`)

15 new ops, grouped by card:

### Leadership
- `gain_command_tokens(n, pool)` — grants `n` tokens to the specified pool (`tactic | fleet | strategy`)
- `spend_influence_for_tokens(planet_ids, pool)` — exhausts specified planets, totals their influence, grants `floor(total / 3)` tokens to `pool` (LRR §52.2–52.3)

### Diplomacy
- `diplomacy_lock_system(system_coords)` — for each other player: if they have no command token in the target system, decrements one token from their reinforcements count and inserts a row in `game_system_activations`; skips players already in system (LRR §32.2a–b)
- `ready_planets(planet_ids)` — readies up to 2 specified exhausted planets controlled by the player; reusable for Diplomacy primary and secondary (LRR §32.2, §32.3)

### Politics
- `change_speaker(player_id)` — updates `games.speaker_player_id`; rejects if target player already has speaker token (LRR §66.2i)
- `draw_action_cards(n)` — draws `n` cards from the action card deck into the player's hand; reusable for Politics primary and secondary (LRR §66.2ii, §66.3)
- `peek_reorder_agenda(top_first, swap)` — reads the top 2 agenda deck cards, reorders them per `top_first` / `swap` flags, writes new order back; result (card names + text) returned to caller only, not broadcast (LRR §66.2iii)

### Construction
- `place_structure_on_planet(planet_id, unit_type)` — validates player controls planet, enforces max PDS=2 and max space dock=1 per planet, places unit (LRR §24.2, §85.4–85.5)

### Trade
- `gain_trade_goods(n)` — grants `n` trade goods (LRR §92.2)
- `replenish_commodities()` — sets player's commodities to their faction max; reusable for Trade primary and secondary (LRR §92.3, §92.5)
- `grant_free_secondary(player_ids)` — writes `player_ids` to `game_strategy_card_plays.free_secondary_player_ids` (LRR §92.4)

### Warfare
- `warfare_remove_board_token(system_coords, pool)` — removes one of the player's command tokens from the specified system (must own a token there), adds it to `pool` on their command sheet (LRR §99.1)
- `warfare_redistribute_tokens(tactic, fleet, strategy)` — sets tactic/fleet/strategy pool sizes; validates `tactic + fleet + strategy ≤ 16` (LRR §99.2, DB CHECK constraint)

### Technology
- `research_technology(tech_id)` — researches one tech free; delegates to existing research validation (prereqs, faction restriction) (LRR §91.2)
- `research_technology_paid(tech_id, resource_cost)` — researches a second tech after spending 6 resources; validates and exhausts planets/trade goods (LRR §91.2)

### Imperial
- `score_public_objective_imperial(objective_id)` — scores the specified public objective; delegates to Phase 36's condition checker to validate eligibility (LRR §45.2)
- `gain_vp_for_mecatol()` — grants 1 VP if player controls Mecatol Rex; checked by querying `game_player_planets` for Mecatol Rex planet ID (LRR §45.2)
- `draw_secret_objective()` — draws 1 secret objective; enforces ≤3 total secret objectives (hand + scored); prompts discard-down if limit exceeded (LRR §45.3–45.4)

---

## Edge Function Changes

No new edge functions. Only the two existing strategy card functions change.

### `game-play-strategy-card`

Accepts a richer `selections` object validated per `card_number`:

| Card | `selections` shape |
|------|--------------------|
| Leadership | `{ influence_planet_ids: string[], token_pool: 'tactic'\|'fleet'\|'strategy' }` |
| Diplomacy | `{ target_system_coords: string, planets_to_ready: string[] }` |
| Politics | `{ new_speaker_player_id: string, agenda_top_first: bool, agenda_swap: bool }` |
| Construction | `{ structures: [{planet_id: string, unit_type: 'pds'\|'space_dock'}, ...] }` (1–2 entries) |
| Trade | `{ free_secondary_player_ids: string[] }` |
| Warfare | `{ remove_from_system_coords: string, remove_to_pool: string, redistribution: {tactic: number, fleet: number, strategy: number} }` |
| Technology | `{ tech_1_id: string, tech_2_id?: string }` |
| Imperial | `{ public_objective_id?: string }` |

Additional behaviour:
- Politics: after resolving DSL ops, returns `{ play_id, peek_cards: [{id, name, text}, {id, name, text}] }` to the caller only (not stored in any broadcast-visible column)
- Imperial: checks Mecatol Rex control and branches to `gain_vp_for_mecatol` or `draw_secret_objective` accordingly

### `game-use-strategy-secondary`

Accepts card-specific `selections`:

| Card | `selections` shape | Notes |
|------|--------------------|-------|
| Leadership | `{ influence_planet_ids: string[], token_pool: string }` | |
| Diplomacy | `{ planets_to_ready: string[] }` | |
| Politics | — | Auto-draws 2 action cards |
| Construction | `{ system_coords: string, planet_id: string, unit_type: string }` | Also places command token in system |
| Trade | — | Checks `free_secondary_player_ids`; waives token cost if player is in the list |
| Warfare | `{ production_unit_selections: object }` | Runs production DSL ops for home space dock inline, no separate function call |
| Technology | `{ tech_id: string }` | Spends 1 strategy token + 4 resources |
| Imperial | — | Auto-draws 1 secret objective |

Response-row completion logic (marking `status = 'used' | 'passed'`, closing play when all responded) is unchanged.

---

## Client-Side Constants (`src/lib/strategyCardConstants.js`)

Keyed by card number 1–8. Each entry:
```js
{
  number: 1,
  name: 'Leadership',
  initiative: 1,
  primaryText: '...',
  secondaryText: '...',
  primarySelectionsSchema: [...],  // form field descriptors
  secondarySelectionsSchema: [...],
}
```

The `selectionsSchema` arrays are field descriptors (type, label, options, validation) consumed by `StrategyCardModal` to render the correct form without hardcoded per-card branches in JSX.

---

## UI Changes

### `src/hooks/useStrategyCards.js`

- Add `agendaPeekCards` state: stores `peek_cards` returned by `game-play-strategy-card` when Politics primary resolves, for display as a post-submit confirmation to the active player
- Expose via hook return

### `src/components/game/StrategyCardPanel.jsx`

- Strategy phase: show card name + initiative alongside number when card is picked (sourced from constants)
- Action phase: show card name on the "PLAY STRATEGY CARD" button (e.g. "PLAY TRADE")

### `src/components/game/StrategyCardModal.jsx`

**Card face header** (always visible):
- Card name, initiative number, primary ability text, secondary ability text (from constants)

**Primary form** (rendered in `StrategyCardPanel` before calling `game-play-strategy-card`):
- Data-driven from `primarySelectionsSchema` in constants
- Per-card form controls:
  - *Leadership*: influence amount input + token pool radio
  - *Diplomacy*: system hex picker + up to 2 exhausted planet pickers
  - *Politics*: player picker (new speaker) + swap/keep toggle for the top 2 agenda cards (player decides order before submitting — the peek result is shown after the call resolves as a confirmation)
  - *Construction*: 1–2 planet pickers + PDS/space-dock radio each; second structure optional
  - *Trade*: multi-select player checkboxes for free secondary recipients
  - *Warfare*: system hex picker (token to remove) + pool destination picker + redistribution sliders (tactic/fleet/strategy, live sum display, rejects if >16)
  - *Technology*: tech picker + optional second tech picker (unlocks after "spend 6 resources" is confirmed)
  - *Imperial*: public objective picker (filtered to Phase 36–eligible objectives); Mecatol VP vs. secret objective draw shown as read-only outcome preview

**Secondary form** (shown when `isMyTurnToRespond`):
- Data-driven from `secondarySelectionsSchema`
- Simpler inputs per card as described in edge function section above

**Card-holder view** (response status list): unchanged.

No new components — all form logic lives inside the existing `StrategyCardModal`.

---

## Tests

### Edge function tests

Per card, happy-path + key error cases:

- **Leadership**: correct token count granted; influence spend floors at 3:1; correct planets exhausted
- **Diplomacy**: tokens placed for all other players; skips players already in system; readies exactly the specified planets (≤2)
- **Politics**: speaker token moves to chosen player; rejects current speaker as target; 2 action cards drawn; agenda deck reordered correctly for both swap cases; peek result in response body only
- **Construction**: PDS placed on controlled planet; space dock placed; 2nd PDS optional; rejects planet at PDS max (2); rejects planet at space dock max (1); rejects uncontrolled planet
- **Trade**: 3 TGs gained; commodities capped at faction max; `free_secondary_player_ids` written correctly; secondary waives token cost for designated players, charges others
- **Warfare**: token removed from specified system; rejected if player has no token there; redistribution accepted if ≤16, rejected if >16; home space dock production works via secondary
- **Technology**: first tech free with prereq check; second tech requires 6 resources; strategy token + 4 resources spent on secondary
- **Imperial**: scores public objective only if Phase 36 conditions met; branches correctly on Mecatol Rex control; secret objective discard enforced when hand+scored >3

### Hook/component tests

- `useStrategyCards`: `agendaPeekCards` populated after Politics primary; `confirmAgendaOrder` calls correct handler
- `StrategyCardPanel`: card name shown in strategy phase and on play button in action phase
- `StrategyCardModal`: correct form fields rendered per card number; primary form submits with correct selections shape; secondary form shown only to `isMyTurnToRespond` player; card face text always visible regardless of game state
