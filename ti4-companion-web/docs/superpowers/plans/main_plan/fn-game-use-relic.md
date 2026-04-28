# fn-game-use-relic
**File:** `supabase/functions/game-use-relic/index.ts`
**Status:** New
**Prereqs:** migration-034-exploration, shared-relicEffects, shared-abilityDsl

## Functionality
```pseudocode
CORS; AUTH; BODY(game_id, player_id, relic_id)
// Optional: choice (0|1)
GAME(active_player_id, phase); PLAYER

// Fetch relic
relicRow = select game_relic_deck where id=relic_id + game_id
ERR 404 'Relic not found' if !relicRow
ERR 409 'Relic not owned by player' if relicRow.held_by_player_id !== player_id
ERR 409 'Relic already exhausted' if relicRow.exhausted = true
ERR 409 'Relic already purged' if relicRow.state = 'purged'

// Fetch reference relic data
relicDef = select relics where id=relicRow.relic_id
ACTION_RELICS = ['Dominus Orb','Maw Of Worlds','Stellar Converter','The Codex','Enigmatic Device']
if relicDef.name IN ACTION_RELICS:
  ACTIVE_PLAYER

ops = RELIC_EFFECTS[relicDef.name]
ERR 409 'Unknown relic' if ops undefined

context = { gameId, playerId, choice, relicId: relic_id, phase: game.phase }
applyAbility(ops, context, db)

// Exhaust or purge per relic metadata
if relicDef.purge_on_use:
  update game_relic_deck SET state='purged' WHERE id=relic_id
elif relicDef.exhaustable:
  update game_relic_deck SET exhausted=true WHERE id=relic_id

// Shard of the Throne: VP awarded/removed at transfer time, not here
// Crown of Emphidia purge for VP: handled by client passing a purge flag in body

OK({ applied: relicDef.name })
```

## Tests
```pseudocode
STD_MOCKS

T401; TCORS
T400('game_id'); T400('player_id'); T400('relic_id')
T404_PLAYER
T404 'relic not found'
T409('Relic not owned by player')
T409('Relic already exhausted')
T409('Relic already purged')
T409_ACTIVE — for The Codex (ACTION relic) when not active player

it('purges after use for purge_on_use relics') — Dominus Orb state='purged'
it('exhausts after use for exhaustable relics') — Scepter exhausted=true
it("applies choice branch for Prophet's Tears") — choice=0 → ignore_prerequisite
it('applies gain_technology for Enigmatic Device with resource spend')
it('allows reactive relic use without active player gate') — Scepter, Prophet's Tears
```

## Phase 21 Changes

Stellar Converter purges a planet. After applying its ops, DELETE any `game_player_legendary_cards` row for `context.planet_name`:

```pseudocode
// After applyAbility for Stellar Converter:
DELETE FROM game_player_legendary_cards
  WHERE game_id=gameId AND planet_name=context.planet_name
```

### Phase 21 Tests

```pseudocode
GIVEN relic=Stellar Converter, planet_name='primor' has a legendary card row
  EXPECT game_player_legendary_cards.delete called for planet_name='primor'

GIVEN relic=Stellar Converter, planet_name='standard_planet' (no legendary card row)
  EXPECT no error — DELETE is a no-op if row doesn't exist
```
