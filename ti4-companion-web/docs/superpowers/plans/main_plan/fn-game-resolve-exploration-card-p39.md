# fn-game-resolve-exploration-card-p39
**File:** `supabase/functions/game-resolve-exploration-card/index.ts`
**Status:** Modify
**Prereqs:** fn-game-resolve-exploration-card, migration-051-exploration-fixes, shared-explorationEffects-p39, shared-abilityDsl-p39

## Functionality

### Body param additions
```pseudocode
// Optional new fields:
command_token_bucket: 'tactic_total' | 'fleet' | 'strategy'  // for Volatile Fuel Source
unit_type: string        // for Freelancers (omit to skip production)
resource_planet_names: string[]  // for Freelancers
```

### Card select: add system_key and purge columns
```pseudocode
select '...existing fields..., system_key, purge'
ExplorationCardRow type adds: system_key: string | null; purge: boolean
```

### systemKey fix
```pseudocode
// Replace: const systemKey: string | null = null
// With:
const systemKey = card.system_key ?? null
```

### Dispatch signal union extension
```pseudocode
// Return type: 'handled' | 'passthrough' | 'relic_fragment' | 'attachment' | 'hold' | Response
```

### New dispatch cases

`ready_current_planet`:
```pseudocode
update game_player_planets SET exhausted=false
WHERE game_id + player_id + planet_name=ctx.planetName
return 'handled'
```

`clear_planet_units_and_structures`:
```pseudocode
// Demilitarized Zone immediate effect
update game_player_planets SET space_dock_unit_id=null, pds_count=0
WHERE game_id + player_id + planet_name=ctx.planetName
delete game_player_units WHERE game_id + player_id + on_planet=ctx.planetName
return 'handled'
```

`hold_card`:
```pseudocode
return 'hold'  // signals final state machine to set state='held'
```

`gain_named_relic`:
```pseudocode
relicName = op.name as string
fetch game_relic_deck WHERE game_id + name=relicName + state='deck'
if found: update state='held', held_by_player_id=player_id
// silently skip if not in deck
return 'handled'
```

`place_mech_on_current_planet`:
```pseudocode
// Max 1 mech per planet
existing = fetch game_player_units WHERE game_id + player_id
           + unit_type='mech' + on_planet=ctx.planetName
if existing and existing.count >= 1: ERR 'Planet already has a mech'
upsert game_player_units: unit_type='mech', system_key=ctx.systemKey,
       on_planet=ctx.planetName, count=1
return 'handled'
```

`freelancers_produce`:
```pseudocode
if !ctx.unitType: return 'handled'  // optional, player skipped
fetch unit def for unit_type → cost (from 'units' reference table)
fetch game_player_planets WHERE game_id + player_id + planet_name IN resource_planet_names
ERR 409 if count != resource_planet_names.length or any exhausted
fetch tiles WHERE id IN unique tile_ids
totalSpend = sum(tile.planets[planet_name].resources + tile.planets[planet_name].influence)
ERR 409 'Insufficient resources' if totalSpend < cost
exhaust all chosen planets
upsert game_player_units: unit_type=ctx.unitType, system_key=ctx.systemKey,
       on_planet=null, count+1
// Note: bypasses fleet-pool and capacity checks (LRR §35.2 — no activation required)
return 'handled'
```

`place_mirage`:
```pseudocode
// Defensive fallback (unreachable for planet cards; Mirage is frontier-only)
upsert game_system_state SET has_mirage=true WHERE game_id + system_key=ctx.systemKey
upsert game_player_planets: planet_name='mirage', system_key=ctx.systemKey, exhausted=false
return 'handled'
```

### Final state machine
```pseudocode
if signalType === 'relic_fragment' OR signalType === 'hold':
  update state='held', resolved_by_player_id=player_id
else if card.purge:
  update state='purged', resolved_by_player_id=null
else:
  update state='discarded', resolved_by_player_id=null
```

## Tests
```pseudocode
// Existing tests continue to pass unchanged

// New tests:
it('passes system_key from card row to dispatch context')
  card with system_key='3,-1' → ctx.systemKey='3,-1'

it('applies ready_current_planet for Expedition with mech present')
  card.name='Expedition'; units has mech on planet
  → game_player_planets.exhausted set to false for ctx.planetName

it('applies convert_all_commodities for Merchant Station choice=1')
  card.name='Merchant Station', choice=1
  → applyAbility called with convert_all_commodities op

it('applies gain_command_token_choice for Volatile Fuel Source with mech')
  card.name='Volatile Fuel Source'; mech present; command_token_bucket='fleet'
  → applyAbility called with gain_command_token_choice op; context.selections.command_token_bucket='fleet'

it('applies clear_planet_units_and_structures for Demilitarized Zone')
  card.name='Demilitarized Zone', planet_name='Wellon'
  → game_player_planets updated (space_dock_unit_id=null, pds_count=0)
  → game_player_units deleted for on_planet='Wellon'

it('applies gain_named_relic for Tomb Of Emphidia')
  card.name='Tomb Of Emphidia'; relic deck has Crown of Emphidia
  → game_relic_deck updated state='held' for Crown of Emphidia

it('skips gain_named_relic silently if Crown of Emphidia not in deck')

it('sets state=held for hold_card (Enigmatic Device)')
  card.name='Enigmatic Device'
  → card state='held', resolved_by_player_id=PLAYER_ID

it('sets state=purged for purge:true card (Gamma Wormhole)')
  card.name='Gamma Wormhole', purge=true
  → card state='purged'

it('applies freelancers_produce when unit_type provided')
  card.name='Freelancers'; body.unit_type='infantry'; body.resource_planet_names=['Mecatol Rex']
  planet has resources≥unit_cost; → planet exhausted; unit inserted

it('skips freelancers_produce when unit_type omitted')
  card.name='Freelancers'; no unit_type in body → 200, no unit insert

it('409 when freelancers resources insufficient')

it('409 Planet already has a mech for place_mech_on_current_planet')
  card.name='Local Fabricators', choice=1
  existing mech on planet → 409
```
