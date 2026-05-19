# fn-game-explore-frontier-p39
**File:** `supabase/functions/game-explore-frontier/index.ts`
**Status:** Modify
**Prereqs:** fn-game-explore-frontier, migration-051-exploration-fixes, shared-explorationEffects-p39

## Functionality
Four changes:

### 1. Store system_key on drawn card row
```pseudocode
update game_exploration_decks SET
  state='drawn', resolved_by_player_id=playerId, system_key=systemKey
WHERE id=card.id
// (Frontier cards are immediately resolved, but system_key is stored for audit/consistency)
```

### 2. Add choice dispatch to dispatchFrontierOp
```pseudocode
case 'choice':
  options = op.options as Op[][]
  chosen = options[ctx.choice ?? 0] ?? []
  for innerOp in chosen:
    await dispatchFrontierOp(innerOp, ctx, resolveContext, dbClient)
  return 'handled'
```
This fixes Merchant Station (choice 0 = replenish_commodities, choice 1 = convert_all_commodities).

### 3. Fix place_mirage to also set has_mirage
```pseudocode
case 'place_mirage':
  upsert game_system_state SET has_mirage=true
         WHERE game_id + system_key (onConflict: game_id,system_key)
  upsert game_player_planets: game_id, player_id, planet_name='mirage',
         tile_id=null, exhausted=false, explored=false
         (onConflict: game_id,player_id,planet_name)
  return 'purge'   // card is purged, not discarded
```

### 4. Add hold_card dispatch + purge state machine
```pseudocode
case 'hold_card':
  return 'held'

// Final state:
if held:   update state='held', resolved_by_player_id=playerId
elif purge: update state='purged', resolved_by_player_id=null
else:      update state='discarded', resolved_by_player_id=null
```
`purge` signal is raised when any dispatch call returns `'purge'`.
Cards with card.purge=true also trigger purge (Gamma Relay, Mirage, Gamma Wormhole if encountered here).

## Tests
```pseudocode
it('stores system_key on drawn card row')
it('resolves Merchant Station choice=0 via replenish_commodities')
it('resolves Merchant Station choice=1 via convert_all_commodities')
it('sets has_mirage=true in game_system_state for Mirage card')
it('inserts mirage row into game_player_planets for Mirage card')
it('sets card state=purged for Mirage (not discarded)')
it('keeps Enigmatic Device in held state via hold_card op')
```
