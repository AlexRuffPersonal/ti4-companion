# Phase 19 — Ability DSL Completions

**Date:** 2026-04-28
**Status:** Approved

## Goal

Wire up the 12 no-op stubs in `abilityDsl.ts` so every DSL op has a real server-side implementation. One small migration adds the only new schema column needed (`vote_prevented`). No other tables change.

---

## Files

| File | Status | Notes |
|------|--------|-------|
| `supabase/migrations/035_ability_dsl_completions.sql` | New | Adds `vote_prevented` to `game_players` |
| `supabase/functions/_shared/abilityDsl.ts` | Modify | Wire 12 ops; add `CombatResolveContext` |
| `supabase/functions/game-cast-votes/index.ts` | Modify | Reject if `vote_prevented = true` |
| `supabase/functions/game-advance-phase/index.ts` | Modify | Clear `vote_prevented` when leaving agenda |
| `supabase/functions/game-resolve-ability/index.ts` | Modify | Accept combat context fields; build `CombatResolveContext` |
| `supabase/functions/game-roll-combat-dice/index.ts` | Modify | Add `hit_on` to `DieResult` type so `modify_roll` can recompute hits |

---

## Migration 035

```sql
ALTER TABLE game_players
  ADD COLUMN vote_prevented BOOLEAN NOT NULL DEFAULT false;
```

No other schema changes. All remaining ops work with existing tables.

---

## Type Changes — `abilityDsl.ts`

### `ResolveContext` (extend existing)

Add one optional internal flag — never set from a request, only set mid-execution by `ignore_prerequisite`:

```ts
ignorePrerequisite?: boolean
```

### `CombatResolveContext` (new, extends `ResolveContext`)

```ts
export interface CombatResolveContext extends ResolveContext {
  combatId: string
  systemKey: string
  side: 'attacker' | 'defender'
}
```

`game-resolve-ability` constructs a `CombatResolveContext` when `combat_id`, `system_key`, and `side` are present in the request body; otherwise constructs the base `ResolveContext` as before.

---

## Op Implementations

### Group 1 — Resource Mutations

**`draw_secret_objective`**
- Fetch top card from secret objective deck by `deck_position` WHERE `state = 'deck'`.
- ERR 409 if deck empty.
- Update row: `state = 'held'`, `held_by_player_id = activatingPlayerId`.

**`convert_commodities`**
- `amount = op.amount` (integer).
- ERR 409 if `player.commodities < amount`.
- `UPDATE game_players SET commodities = commodities - amount, trade_goods = trade_goods + amount`.

**`gain_command_tokens`**
- `bucket = op.bucket` ∈ `{'tactic_total', 'fleet', 'strategy'}`.
- `amount = op.amount ?? 1`.
- Read `command_tokens` JSONB; increment the named key; write back.
- DB CHECK constraint (`tactic_total + fleet + strategy <= 16`) enforces the cap — let it return a DB error, caught and re-thrown as 409.

**`take_from_discard`**
- `deck = op.deck` ∈ `{'action_card'}` (extend later for other decks).
- Fetch row from `game_action_card_deck WHERE game_id AND state = 'discard' AND id = selections.card_id`.
- ERR 409 if not found or not in discard.
- Update: `state = 'held'`, `held_by_player_id = activatingPlayerId`, `deck_position = null`.
- Increment `game_players.action_card_count`.

---

### Group 2 — Technology

**`ignore_prerequisite`**
- Sets `context.ignorePrerequisite = true` in memory. No DB write.
- Has no effect unless a subsequent `gain_technology` op reads it in the same effects array.

**`gain_technology`**
- `techName = selections.technology_name`.
- Fetch tech row from `technologies` reference table.
- ERR 409 if not found.
- ERR 409 if already in `player.technologies`.
- If `context.ignorePrerequisite !== true`: validate prerequisites — each prerequisite colour must appear at least once in `player.technologies`; ERR 409 if not met.
- `UPDATE game_players SET technologies = array_append(technologies, techName)`.

---

### Group 3 — Agenda

**`cast_votes`**
- `voteCount = op.amount ?? selections.vote_count`.
- `outcome = selections.vote_outcome` ∈ `{'for', 'against'}`.
- Upsert into `game_agenda_votes`: `{game_id, player_id: activatingPlayerId, vote_count: voteCount, outcome}`.

**`prevent_vote`**
- `targetId = op.target === 'self' ? activatingPlayerId : (context.targetPlayerId ?? activatingPlayerId)`.
- ERR 409 if target player not in game.
- `UPDATE game_players SET vote_prevented = true WHERE id = targetId`.

**`game-cast-votes` change**
- After loading the acting player row, ERR 409 `'Your vote has been prevented'` if `player.vote_prevented = true`.

**`game-advance-phase` change**
- When transitioning out of `agenda` phase (i.e., `currentPhase = 'agenda'` and advancing), reset: `UPDATE game_players SET vote_prevented = false WHERE game_id = gameId`.

---

### Group 4 — Combat (requires `CombatResolveContext`)

All four ops load the `game_combats` row by `context.combatId` and ERR 409 if not found. `side` determines which columns to read/write (`attacker_*` vs `defender_*`).

**`cancel_hit`**
- `targetSide = op.target === 'self' ? context.side : (context.side === 'attacker' ? 'defender' : 'attacker')`.
- Decrement `attacker_hits` or `defender_hits` for `targetSide`; floor at 0.
- `UPDATE game_combats SET <hits_col> = GREATEST(0, <hits_col> - 1) WHERE id = combatId`.

**`add_die`**
- `hitOn = op.hit_on` (integer, 1–10).
- Roll 1d10 server-side.
- Append `{unit_type: '__ability__', roll, hit_on: hitOn, hit: roll >= hitOn}` to the side's `attacker_dice` or `defender_dice` JSONB array.
- If hit, increment the side's `attacker_hits` or `defender_hits`.

**`modify_roll`**
- `modifier = op.modifier` (integer, e.g. +1 or -1).
- Requires `hit_on` stored per die entry — `game-roll-combat-dice` is updated to include `hit_on` in each `DieResult` (new field alongside existing `unit_type`, `roll`, `hit`).
- Load side's dice JSONB; for each entry, add `modifier` to `roll`, recompute `hit = (roll + modifier) >= hit_on`; recount total hits.
- Write updated dice array and recounted hits back to the combat row.

**`place_units`**
- `unitType = op.unit_type`, `count = op.count ?? 1`.
- `onPlanet = selections.planet_name ?? null`.
- `systemKey = selections.system_key ?? context.systemKey`.
- Upsert `game_player_units`: if row exists for `(game_id, player_id, system_key, unit_type, on_planet)`, increment count; else insert.

**`destroy_units`**
- `unitType = selections.unit_type`, `count = selections.count ?? 1`.
- `onPlanet = selections.planet_name ?? null`.
- `systemKey = selections.system_key ?? context.systemKey`.
- Fetch row; ERR 409 if not found or count < requested.
- Decrement count; delete row if count reaches 0.

---

## Tests

**`game-roll-combat-dice`**: update existing tests to assert each die entry includes `hit_on`. No new test cases needed.

All DSL ops are exercised through `game-resolve-ability` integration tests and the following targeted additions:

- `convert_commodities`: deducts commodities, adds trade goods; ERR 409 if insufficient commodities.
- `gain_command_tokens`: increments the correct bucket; DB constraint enforces cap.
- `take_from_discard`: moves card from discard to hand; ERR 409 if card not in discard.
- `gain_technology`: appends tech; prerequisite validation skipped when `ignore_prerequisite` precedes it; ERR 409 if already researched.
- `prevent_vote` + `game-cast-votes`: player with `vote_prevented = true` gets 409.
- `game-advance-phase`: `vote_prevented` cleared for all players when leaving agenda.
- `cancel_hit`: hits decremented, floored at 0.
- `add_die`: die appended to JSONB, hits incremented on success.
- `modify_roll`: dice values adjusted, hit counts recalculated.
- `place_units`: row upserted; count incremented on duplicate.
- `destroy_units`: count decremented; row deleted at 0; ERR 409 if insufficient units.
- `draw_secret_objective`: card moved to held; ERR 409 if deck empty.
