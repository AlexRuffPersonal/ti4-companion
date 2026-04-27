# fn-game-unlock-hero
**File:** `supabase/functions/game-unlock-hero/index.ts`
**Status:** New
**Prereqs:** migration-033-leaders

## Functionality
```pseudocode
CORS
AUTH
BODY(game_id, leader_id)
PLAYER(id, leaders)

fetch leaders where id=leader_id; 404 if missing
if leader.leader_type !== 'hero' → ERR('Leader is not a hero', 400)
if player.leaders.hero !== 'locked' → ERR('Hero already unlocked or purged', 409)

// Count scored objectives (public + secret)
pubCount = COUNT(game_public_objectives where game_id AND scored_by contains player.id)
secCount = COUNT(game_player_secret_objectives where game_id AND player_id AND state='scored')
if pubCount + secCount < 3 → ERR('Unlock condition not met: need 3 scored objectives', 409)

update game_players.leaders → { ...leaders, hero: 'unlocked' }
OK({ unlocked: true })
```

## Tests
```pseudocode
STD_MOCKS
T401
T400(game_id missing)
T400(leader_id missing)
T404_PLAYER
it('404 leader not found')
it('400 leader is not a hero')
it('409 hero already unlocked')
it('409 hero purged')
it('409 fewer than 3 scored objectives')
it('200 unlocks hero when player has 3 public objectives')
it('200 counts secret objectives toward threshold')
```
