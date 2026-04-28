# Phase 21: Legendary Planets & Wormhole Nexus — Design

## Scope

PoK legendary planets only (Titans of Ul deferred — see POTENTIAL_TODOS.md). Four legendary planet ability cards:

| Planet | Card Name | Ability |
|---|---|---|
| Primor | The Atrament | End of turn: place up to 2 infantry from reinforcements on any planet you control |
| Hope's End | Imperial Arms Vault | End of turn: place 1 mech on any planet you control **or** draw 1 action card |
| Mallice | Exterrix Headquarters | End of turn: gain 2 trade goods **or** convert all commodities to trade goods |
| Mirage | Mirage Flight Academy | End of turn: place up to 2 fighters in any system containing your ships |

Mirage is discovered via Frontier Token exploration, not a fixed tile.

Also in scope: Wormhole Nexus active/inactive flip.

## Rules Basis

- **§53 Legendary Planets** — Gaining control of a legendary planet grants its legendary planet ability card (readied if from deck, exhausted if taken from another player). Exhausted to use ability. If planet is purged, ability card is also purged.
- **§100 Wormhole Nexus** — Starts inactive (gamma wormhole only). Flips permanently to active (alpha + beta + gamma) when any player moves or places a unit into it, or gains control of Mallice.

## Database Schema

### Migration 037

**New table `game_player_legendary_cards`:**

```sql
game_id     uuid REFERENCES games(id) ON DELETE CASCADE
player_id   uuid REFERENCES game_players(id)
planet_name text  -- "primor" | "hopes_end" | "mallice" | "mirage"
status      text  -- "readied" | "exhausted"
PRIMARY KEY (game_id, planet_name)
```

- One row per legendary planet per game (a planet can only be held by one player at a time)
- Purge = DELETE the row
- Transfer between players = UPDATE player_id (status preserved per LRR 53.2b)

**New column on `games`:**

```sql
wormhole_nexus_active BOOLEAN NOT NULL DEFAULT false
```

Single boolean, flips permanently to `true` on first trigger.

## Edge Functions

### `game-land-troops` (modify)

After planet control changes, check if the planet is legendary:
- New controller does not have the card → INSERT `readied`
- Another player held it → UPDATE `player_id`, preserve `status`
- Planet is Mallice → also SET `games.wormhole_nexus_active = true`

### `game-resolve-ability` (modify)

Add ability source type `legendary_card`:
- Validate caller is `games.active_player_id`
- Validate card `status = 'readied'`
- Apply DSL ops
- UPDATE card `status = 'exhausted'`

Ability definitions are hardcoded as a lookup object in `_shared/abilityDsl.ts` keyed by `planet_name` (only 4 fixed cards, not worth a DB table).

### `_shared/abilityDsl.ts` (modify)

Two new DSL ops:

- **`draw_action_card`** — draws the top card of the action card deck into the player's hand (same logic as `game-draw-action-card`)
- **`gain_trade_goods`** — increments `game_players.trade_goods` by N

Existing ops wired up for legendary use: `place_units`, `convert_commodities`.

### `game-advance-phase` (modify)

Status Phase readying step: SET `status = 'readied'` on all `game_player_legendary_cards` rows for the game (alongside existing planet card readying).

### `game-use-relic` (modify, Phase 17 hook)

When a relic effect purges a planet (e.g. Stellar Converter), also DELETE the `game_player_legendary_cards` row for that `planet_name` if one exists. Phase 17 implements `game-use-relic`; Phase 21 extends it with this side-effect.

### `shared-explorationEffects.ts` (modify)

`place_mirage` op additionally INSERTs a `readied` legendary card row (`planet_name = 'mirage'`) for the exploring player, alongside existing Mirage planet creation logic.

No changes to `game-resolve-exploration-card` (handles planet exploration only, not frontier).

## Timing Enforcement: End-of-Turn Window

**Approach: client-side dialog (Option A)**

When the active player clicks "End Turn":
1. Client checks if the player has any `readied` legendary cards
2. If yes → show `EndTurnDialog` listing available cards with ability text and "Use" buttons
3. Each "Use" calls `game-resolve-ability` with source `legendary_card`; card exhausts in real-time
4. "Done" or "Skip" buttons both call `game-end-turn`
5. If no readied cards → call `game-end-turn` directly

Server validates `active_player_id` match and `status = 'readied'` as a lightweight guard. Full mid-turn use prevention is not enforced server-side (noted in POTENTIAL_TODOS for future hardening).

## Client UI

### `useLegendaryCards.js` (new hook)

- Fetches `game_player_legendary_cards` for the game
- Subscribes to Realtime updates
- Exposes `myCards`, `allCards` (for opponent panel display)
- Provides `exhaustCard(planetName)` → calls `game-resolve-ability`

### `LegendaryCardPanel.jsx` (new component)

- Renders player's legendary cards in `MyPanelSection`
- Shows: card name, planet name, ability text, readied/exhausted indicator
- No "Use" button (ability use is via `EndTurnDialog`)

### `EndTurnDialog.jsx` (new component)

- Shown before `game-end-turn` when player has readied legendary cards
- Lists cards with ability text and "Use" button per card
- "Skip & End Turn" / "Done, End Turn" both call `game-end-turn`

### `GalaxyTab.jsx` (modify)

- Reads `game.wormhole_nexus_active`
- Inactive: renders nexus tile with gamma wormhole indicator only
- Active: renders nexus tile with alpha + beta + gamma wormhole indicators
- Passive display only; no interaction

### `edgeFunctions.js` (modify)

Add typed wrappers for `legendary_card` resolve calls and new DSL ops.

## Testing

### `game-land-troops`
- Landing on legendary planet grants readied card to new controller
- Taking legendary planet from another player transfers card, preserving exhausted status
- Gaining Mallice flips `wormhole_nexus_active` to `true`
- Non-legendary planet change has no effect on legendary cards table

### `game-resolve-ability`
- `legendary_card` source exhausts card after resolving
- Returns 403 if caller is not `active_player_id`
- Returns 409 if card status is `exhausted`
- `draw_action_card` op draws top of action deck into player's hand
- `gain_trade_goods` op increments `trade_goods` by correct amount
- `convert_commodities` op converts correctly when triggered via legendary card

### `game-advance-phase`
- Status Phase readying sets all legendary cards in game to `readied`

### `game-use-relic`
- Stellar Converter relic purging a legendary planet also deletes the `game_player_legendary_cards` row
- Purging a non-legendary planet has no effect on legendary cards table

### `shared-explorationEffects`
- `place_mirage` op inserts readied legendary card row for exploring player alongside planet creation

### Client
- `useLegendaryCards` returns correct `myCards` / `allCards` slices
- `EndTurnDialog` renders when player has readied cards, skips when none
- `EndTurnDialog` calls `game-end-turn` after cards are used or skipped
