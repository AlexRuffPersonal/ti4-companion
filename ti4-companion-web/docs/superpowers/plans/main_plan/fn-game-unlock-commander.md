# fn-game-unlock-commander
**File:** `supabase/functions/game-unlock-commander/index.ts`
**Status:** New
**Prereqs:** shared-commanderUnlock, migration-052-leader-abilities

## Functionality
```pseudocode
CORS
AUTH
BODY(game_id, leader_id)
PLAYER(id, leaders, technologies, trade_goods, action_card_count, commander_flags, faction)

fetch leaders WHERE id=leader_id → { faction, leader_type }
ERR 404 'Leader not found' if missing
ERR 400 'Leader is not a commander' if leader_type !== 'commander'
ERR 409 'Commander already unlocked' if player.leaders?.commander === 'unlocked'

met = await checkCommanderUnlock(faction, game_id, player, db)
ERR 409 'Unlock condition not met' if !met

UPDATE game_players
  SET leaders = jsonb_set(COALESCE(leaders,'{}'), '{commander}', '"unlocked"')
  WHERE id=player.id

OK({ unlocked: true })
```

## Tests
```pseudocode
STD_MOCKS
T401
T400('game_id missing')
T400('leader_id missing')
T404_PLAYER
it('404 leader not found')
it('400 leader is not a commander')
it('409 commander already unlocked') — mock leaders.commander='unlocked'
it('409 unlock condition not met') — mock checkCommanderUnlock to return false
it('200 unlocks commander when condition met') — mock checkCommanderUnlock to return true
  EXPECT game_players.leaders.commander='unlocked'
```
