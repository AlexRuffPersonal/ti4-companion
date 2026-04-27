# fn-game-use-relic-fragment
**File:** `supabase/functions/game-use-relic-fragment/index.ts`
**Status:** New
**Prereqs:** migration-034-exploration, shared-abilityDsl

## Functionality
```pseudocode
CORS; AUTH; BODY(game_id, player_id, fragment_ids)  // fragment_ids: UUID[3]
GAME(active_player_id); PLAYER

ACTIVE_PLAYER  // relic fragment spending is a component action

ERR 400 'Must submit exactly 3 fragment IDs' if fragment_ids.length !== 3

// Fetch and validate all 3 fragments
fragments = select game_exploration_decks where id IN fragment_ids + game_id
ERR 409 'Fragment not found' if fragments.length !== 3
ERR 409 'Fragment not owned by player' if any fragment.resolved_by_player_id !== player_id
ERR 409 'Fragment not in hand' if any fragment.state !== 'held'

// Validate spend combination:
// At least 1 typed (cultural/hazardous/industrial); all 3 are same-type-or-unknown
types = fragments.map(f => f.relic_fragment_type)
typedFragments = types.filter(t => t !== 'unknown')
ERR 409 'Need at least 1 typed fragment' if typedFragments.length === 0
leadType = typedFragments[0]
ERR 409 'Fragments must all match or be unknown' if any type NOT IN [leadType, 'unknown']

// Discard all 3 fragments
update game_exploration_decks SET state='discarded', resolved_by_player_id=null
       WHERE id IN fragment_ids

// Draw relic
applyAbility([{ op:'gain_relic' }], { gameId, playerId }, db)

OK({ relic_gained: true })
```

## Tests
```pseudocode
STD_MOCKS

T401; TCORS
T400('game_id'); T400('player_id'); T400('fragment_ids')
T404_PLAYER
T409_ACTIVE
T409('Must submit exactly 3 fragment IDs') — 2 or 4 IDs
T409('Fragment not owned by player') — resolved_by_player_id mismatch
T409('Fragment not in hand') — state='discarded'
T409('Need at least 1 typed fragment') — all 3 unknown
T409('Fragments must all match or be unknown') — mix of cultural + hazardous

it('accepts 3 cultural fragments') — discards all 3, gains relic
it('accepts 2 hazardous + 1 unknown') — discards all 3, gains relic
it('accepts 1 industrial + 2 unknown') — discards all 3, gains relic
it('rejects cultural + hazardous + unknown') — 409
```
