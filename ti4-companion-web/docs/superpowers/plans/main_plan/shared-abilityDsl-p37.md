# shared-abilityDsl-p37
**File:** `supabase/functions/_shared/abilityDsl.ts`
**Status:** Modify
**Prereqs:** migration-047-strategy-card-effects, shared-objectiveConditions

## New ops

```pseudocode
case 'spend_influence_for_tokens':
  planetIds = sel.influence_planet_ids as string[]  // may be empty
  pool = (sel.token_pool as string) ?? 'tactic_total'
  if planetIds.length === 0: break  // no extra tokens
  fetch game_player_planets WHERE game_id + player_id + planet_name IN planetIds
  ERR 409 'Planet not owned' for any missing/wrong-owner row
  totalInfluence = sum of planet.influence for each row
  tokenCount = Math.floor(totalInfluence / 3)
  batch UPDATE game_player_planets SET exhausted=true WHERE id IN fetched ids
  UPDATE game_players SET command_tokens = { ...tokens, [pool]: tokens[pool] + tokenCount }
    WHERE id = activatingPlayerId

case 'diplomacy_lock_system':
  systemCoords = sel.target_system_coords as string
  ERR 409 'target_system_coords required' if missing
  fetch all game_players WHERE game_id AND id != activatingPlayerId
  for each otherPlayer:
    existing = query game_system_activations WHERE game_id + player_id=otherPlayer.id + system_key=systemCoords
    if existing: skip (already has token there)
    tokens = otherPlayer.command_tokens as {tactic_total, fleet, strategy}
    totalAvailable = tactic_total + fleet + strategy
    // LRR §32.2a: if no tokens in reinforcements, take from command sheet
    INSERT game_system_activations { game_id, player_id: otherPlayer.id, system_key: systemCoords,
      round: game.round, token_owner_id: otherPlayer.id }
    // Note: game.round must be in context — pass via context.gameRound
    // Decrement one token from their command sheet (tactic_total first, then fleet, then strategy)
    decrementOneToken(otherPlayer)

case 'grant_free_secondary':
  playerIds = sel.free_secondary_player_ids as string[]
  playId = context.strategyPlayId  // injected by game-play-strategy-card after play row created
  UPDATE game_strategy_card_plays SET free_secondary_player_ids = playerIds WHERE id = playId

case 'warfare_remove_board_token':
  systemCoords = sel.remove_from_system_coords as string
  pool = (sel.remove_to_pool as string) ?? 'tactic_total'
  ERR 409 'remove_from_system_coords required' if missing
  fetch game_system_activations WHERE game_id + player_id=activatingPlayerId + system_key=systemCoords
    AND round=game.round
  ERR 409 'No token to remove from that system' if not found
  DELETE that activation row
  UPDATE game_players SET command_tokens = { ...tokens, [pool]: tokens[pool] + 1 }

case 'warfare_redistribute_tokens':
  tactic = sel.redistribution_tactic as number
  fleet  = sel.redistribution_fleet  as number
  strategy = sel.redistribution_strategy as number
  ERR 409 'redistribution values required' if any undefined
  ERR 409 'Token total exceeds 16' if tactic + fleet + strategy > 16
  UPDATE game_players SET command_tokens = { tactic_total: tactic, fleet, strategy }
    WHERE id = activatingPlayerId

case 'score_public_objective':
  objectiveId = sel.public_objective_id as string
  if !objectiveId: break  // optional — player may have no eligible objectives
  // Delegate to Phase 36 condition checker
  import { checkObjectiveCondition } from '../_shared/objectiveConditions.ts'
  isEligible = await checkObjectiveCondition(db, context.gameId, context.activatingPlayerId, objectiveId)
  ERR 409 'Objective conditions not met' if !isEligible
  // Mark objective as scored by this player
  UPDATE game_player_public_objectives SET scored=true WHERE game_id + player_id + objective_id=objectiveId
  UPDATE game_players SET vp = vp + 1 WHERE id = activatingPlayerId
```

Context extensions needed:
- `context.gameRound: number` — pass from edge function for diplomacy_lock_system
- `context.strategyPlayId: string` — pass from edge function after play row created for grant_free_secondary

ResolveContext interface: add `gameRound?: number` and `strategyPlayId?: string`.

## Tests

Extend `tests/lib/abilityDsl.test.js`:
```pseudocode
spend_influence_for_tokens: grants floor(inf/3) tokens; exhausts correct planets; 409 planet not owned; 0 planets → no-op
diplomacy_lock_system: inserts activations for all other players; skips players already in system; decrements token from command sheet
grant_free_secondary: updates play row with provided player ids
warfare_remove_board_token: deletes activation row; increments correct pool; 409 no token in system
warfare_redistribute_tokens: updates command_tokens correctly; 409 if sum > 16
score_public_objective: calls checkObjectiveCondition; scores if eligible; 409 if not; no-op if no objectiveId
```
