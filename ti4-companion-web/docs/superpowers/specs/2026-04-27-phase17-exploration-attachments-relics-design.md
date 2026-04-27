# Phase 17: Planet Exploration, Attachments & Relics

## Rules Basis

- **§35 Exploration** — Taking control of an uncontrolled planet triggers exploration; player draws from the matching trait deck (cultural/hazardous/industrial); frontier tokens explored via frontier deck (requires Dark Energy Tap or game effect); attachment cards stay with planet on control change; relic fragments placed in player area.
- **§12 Attach** — Attached card stays with planet when control changes; attachment token placed on game board.
- **§73 Relics** — Typed relic fragments (cultural/hazardous/industrial) have a component ACTION to purge 3 of that type and draw a relic; Unknown Relic Fragment counts as any type and substitutes freely in that cost; at least 1 typed fragment required to trigger the ACTION; relics cannot be traded.
- **§22.1 Component Actions** — Relic fragment spending and ACTION-header relics can only be performed during the active player's turn.
- **§38 Frontier Tokens** — One frontier token per empty (no planet) system during setup; discarded after exploration.

---

## Section 1: DB Migration (`034_exploration.sql`)

Two column additions to existing tables:

```sql
ALTER TABLE game_player_planets
  ADD COLUMN explored BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE game_relic_deck
  ADD COLUMN exhausted BOOLEAN NOT NULL DEFAULT false;
```

All other state reuses existing tables:
- **Relic fragments**: `game_exploration_decks` rows with `state = 'held'`, `resolved_by_player_id` = holding player
- **Planet attachments**: `game_player_planets.attachments UUID[]` (already exists)
- **Gamma wormhole / ion storm tokens**: `game_system_state` wormhole/ion_storm columns (already exist)
- **Mirage**: inserted as a new `game_player_planets` row (`planet_name = 'Mirage'`, `tile_id` = system's tile)

---

## Section 2: `abilityDsl.ts` Extensions

### New ops

| Op | Effect |
|---|---|
| `gain_trade_goods` | Add N TGs to player |
| `gain_commodities` | Add N commodities (up to max) |
| `draw_action_card` | Draw N cards from action card deck |
| `draw_secret_objective` | Draw 1 secret objective |
| `attach_to_planet` | Store attachment on planet; add to `attachments[]`; place token |
| `gain_relic_fragment` | Set exploration deck row state='held', resolved_by_player_id=player |
| `place_map_token` | Update `game_system_state` for gamma wormhole or ion storm |
| `place_mirage` | Insert Mirage row into `game_player_planets` for the explored system |
| `ready_planet` | Set `game_player_planets.exhausted = false` for target planet |
| `gain_relic` | Draw top of `game_relic_deck`; set state='held', held_by_player_id=player |

### New meta-op patterns

**`choice`** — `{ op: "choice", options: [op_array_A, op_array_B] }`
Client passes `choice: 0 | 1`; server branches and applies the selected op array.
Used by: Abandoned Warehouses, Functioning Base, Local Fabricators, Merchant Station.

**`conditional_mech_or_infantry`** — `{ op: "conditional_mech_or_infantry", effect: op_array }`
Server checks for a mech on the target planet in `game_player_units`. If present, applies effect immediately. If absent, client must pass `remove_infantry: true`; server removes 1 infantry from the planet then applies effect. If neither condition is met (no mech, no infantry, or player declines), effect is skipped.
Used by: Core Mine, Expedition, Volatile Fuel Source.

### New lookup modules

**`_shared/explorationEffects.ts`** — static map of card name → DSL op array for all exploration cards. Consumed by `game-explore-planet` and `game-explore-frontier`.

**`_shared/relicEffects.ts`** — static map of relic name → DSL op array for ACTION-type relics. Consumed by `game-use-relic`.

---

## Section 3: Edge Functions

### `game-explore-planet`
**Request:** `{ game_id, player_id, planet_name, deck_type }`

Draws only — does not apply the effect.

1. Validate player controls `planet_name`, `explored = false`, `deck_type` is valid for that planet's traits
2. Draw top card from `game_exploration_decks` (lowest `deck_position` where `deck_type` matches and `state = 'deck'`); if deck empty, shuffle discards back in first
3. Set card `state = 'drawn'`, `resolved_by_player_id = player_id`
4. Return card data (name, text, deck_type, has_attachment, relic_fragment_type) to client

### `game-resolve-exploration-card`
**Request:** `{ game_id, player_id, card_id, choice?, remove_infantry? }`

Applies the drawn card's effect.

1. Validate card is `state = 'drawn'` and `resolved_by_player_id = player_id`
2. Look up card's DSL op array from `explorationEffects.ts`
3. Call `applyAbility(ops, context)` where context = `{ game, player, planet_name, system_key, choice, remove_infantry }`
4. Set `game_player_planets.explored = true`

### `game-explore-frontier`
**Request:** `{ game_id, player_id, system_key }`

Draws and resolves in one step (frontier cards have no player choices).

1. Validate player has Dark Energy Tap technology (only recognized gate in Phase 17; other game effects deferred)
2. Validate `game_system_state` has frontier token for `system_key`
3. Draw top card from frontier exploration deck; apply via `explorationEffects.ts` DSL dispatch immediately
4. Remove frontier token from `game_system_state`

### `game-use-relic-fragment`
**Request:** `{ game_id, player_id, fragment_ids[3] }`

1. Validate `game.active_player_id = player_id`
2. Validate all 3 fragment IDs are owned by player (`state = 'held'`, `resolved_by_player_id = player_id`)
3. Validate at least 1 fragment is a typed type (cultural/hazardous/industrial); all 3 are either that same type or `unknown`
4. Set all 3 fragment rows to `state = 'discarded'`, `resolved_by_player_id = null`
5. Apply `gain_relic` op: draw top of `game_relic_deck`, set `state = 'held'`, `held_by_player_id = player_id`

### `game-use-relic`
**Request:** `{ game_id, player_id, relic_id, choice? }`

- For ACTION-header relics (Stellar Converter, The Codex, Enigmatic Device): validate `game.active_player_id = player_id`
- For reactive relics (Scepter of Emelpar, Prophet's Tears, Maw of Worlds, Crown of Emphidia): no active-player gate; surfaced in UI for the player to manually trigger when the timing condition is met — server does not auto-trigger
- Validate relic belongs to player, `exhausted = false`, not purged
- Look up relic's DSL op array from `relicEffects.ts`; call `applyAbility()`
- Exhaust or purge relic per its metadata (`exhaustable`, `purge_on_use`)

### `game-shuffle-exploration-deck`
**Request:** `{ game_id, deck_type }`

Extends the existing `game-shuffle-deck` pattern. Reassigns `deck_position` to all `state = 'discarded'` rows for the given `deck_type`, setting state back to `'deck'` in random order.

---

## Section 4: Client / UI

### `hook-useExploration.js`
Fetches and subscribes (via Realtime) to:
- `game_player_planets` — `explored`, `attachments` for all planets in the game
- `game_exploration_decks` — rows where `resolved_by_player_id = currentPlayerId` and `state = 'held'` (relic fragments in hand)
- `game_relic_deck` — rows where `held_by_player_id = currentPlayerId` (relics in hand)

Exposes: `unexploredPlanets[]`, `relicFragments[]`, `relics[]`, `explorePlanet()`, `exploreFrontier()`, `useRelicFragment()`, `useRelic()`

### `component-ExplorationModal.jsx`
Opened when player taps "Explore" on a planet or frontier token.

Flow:
1. If planet has multiple traits: show deck-type picker (cultural/hazardous/industrial)
2. Call `game-explore-planet`; display returned card name + text
3. If card has `choice` meta-op: show two option buttons before resolving
4. If card has `conditional_mech_or_infantry`: check mech presence via unit state; if absent, prompt "Remove 1 infantry to gain the effect?" with confirm/skip
5. Call `game-resolve-exploration-card` with `{ card_id, choice?, remove_infantry? }`
6. Frontier tokens: call `game-explore-frontier` directly (single step, no choices)

### `component-RelicFragmentPanel.jsx`
Section in MyPanelSection. Shows player's relic fragment hand grouped by type (cultural / hazardous / industrial / unknown). "Spend Fragments" button opens a fragment selector:
- Player taps 3 fragments; client validates: at least 1 typed, all same-type-or-unknown
- Disabled unless `activePlayerId === currentUserId`
- On confirm: calls `game-use-relic-fragment`

### `component-RelicPanel.jsx`
Section in MyPanelSection. Lists held relics with:
- Exhaust button (for exhaustable relics, disabled if already exhausted)
- Use/ACTION button (for ACTION-header relics, disabled unless active player)
- Visual indicator for exhausted state

### GalaxyTab changes
Planet tiles where `explored = false` show an "Explore" badge. Tapping opens ExplorationModal.
Frontier tokens show an "Explore" option when the active player has Dark Energy Tap.

### MyPanelSection changes
If `unexploredPlanets.length > 0`, renders a notification row: "Explore: [Planet A], [Planet B]" with inline Explore buttons per planet.

---

## Deferred / Out of Scope

- **Shard of the Throne transfer mechanic** — the Shard transfers when another player gains a legendary planet you control; legendary planets are not implemented until Phase 21, so this trigger cannot fire in Phase 17. Shard is tracked (held, VP applied on gain) but auto-transfer is deferred.
- **Crown of Emphidia VP purge** — the "Purge if you control Tomb of Emphidia" option requires cross-checking attachment state; surfaced as a manual Use button in Phase 17, server validates Tomb of Emphidia attachment presence.
- **`explore_planet` DSL op** — used by abilities that trigger exploration as a side effect (e.g. Crown of Emphidia's exhaust ability). Implemented in Phase 17 by delegating internally to the same draw+resolve logic as `game-explore-planet` / `game-resolve-exploration-card`.
- **Frontier exploration via non-tech game effects** — only Dark Energy Tap recognized as the gate; other game effects that permit frontier exploration are deferred.
- **Bombardment-enabling from attachments** — Warfare Research Facility's red tech specialty is stored but not enforced until Phase 13.
