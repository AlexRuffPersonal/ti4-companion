# shared-promissoryHandlers-p45
**File:** `supabase/functions/_shared/promissoryHandlers.ts`
**Status:** Modify
**Prereqs:** shared-promissoryHandlers-p39c, fn-game-play-promissory-note-p45

## Functionality

### New no-op stubs

Add `supportForThrone`, `alliance`, `tradeAgreement` as no-op cases in the Model B group (state transition handles them via `game-confirm-transaction` or `into_play_area`; these stubs prevent the `default` branch from throwing 400).

```
case 'supportForThrone':
case 'alliance':
case 'tradeAgreement':
  return  // passive/no-op
```

### Extend `terraform` case — add attachment logic + fix player ID

Current handler only sets `terraform_attached=true` and metadata. Extend it to also:

1. Use `ctx.activatingPlayerId` (holder) for the planet lookup — not `ctx.noteOriginPlayerId`. (Terraform is played by the holder on their own planet.)
2. Load planet row: `SELECT id, attachments, tiles(type) FROM game_player_planets WHERE game_id + player_id(activating) + planet_name`.
   - 409 'Planet not controlled' if null.
   - 409 'Cannot attach Terraform to home planet or Mecatol Rex' if `tile.type === 'faction'` or `planet_name === 'Mecatol Rex'`.
3. `ATTACH_PLANET(gameId, activatingPlayerId, planetName, 'Terraform')` — SELECT `attachments.id WHERE name='Terraform'`; 409 'Already attached' if id already in `planet.attachments`; UPDATE `game_player_planets SET attachments=array_append(...)`.
4. Keep existing `UPDATE game_player_planets SET terraform_attached=true WHERE player_id=activatingPlayerId AND planet_name`.
5. Keep existing metadata update.

### New `blackMarketForgery` case

```
case 'blackMarketForgery': {
  require ctx.selections.fragment_ids: string[] length===2; else dslError 400
  SELECT id, state, resolved_by_player_id, relic_fragment_type
    FROM game_exploration_decks
    WHERE game_id=ctx.gameId AND id IN fragment_ids
  if rows.length !== 2 → dslError 409 'Fragment not found'
  for each fragment:
    if fragment.resolved_by_player_id !== ctx.activatingPlayerId → dslError 409 'Fragment not owned by player'
    if fragment.state !== 'held' → dslError 409 'Fragment not in hand'
    if !fragment.relic_fragment_type → dslError 409 'Fragment has no type'
  if fragment[0].relic_fragment_type !== fragment[1].relic_fragment_type → dslError 409 'Fragments must be the same type'
  UPDATE game_exploration_decks SET state='discarded', resolved_by_player_id=null WHERE id IN fragment_ids
  const { gainedRelicName } = await applyAbility([{ op: 'gain_relic' }], ctx, db)
  if gainedRelicName: await applyOnGainRelicEffect(gainedRelicName, ctx, db)
}
```

Imports needed: add `applyAbility` and `applyOnGainRelicEffect` imports at top.

## Tests (`tests/functions/promissoryHandlers.phase45.test.js`)

**blackMarketForgery:**
- valid 2 same-type fragments → discarded + `applyAbility` called with `[{ op: 'gain_relic' }]`
- fragment_ids missing → dslError 400
- fragment_ids length !== 2 → dslError 400
- fragment not found (DB returns 1 row) → dslError 409
- fragment not owned by player → dslError 409
- fragment state !== 'held' → dslError 409
- mismatched types → dslError 409

**terraform (extended):**
- planet not found → dslError 409
- home planet (tile.type==='faction') → dslError 409
- planet_name==='Mecatol Rex' → dslError 409
- already attached → dslError 409
- valid planet → terraform_attached=true, attachment added, metadata stored

**no-op stubs:**
- `supportForThrone`, `alliance`, `tradeAgreement` each resolve without throwing
