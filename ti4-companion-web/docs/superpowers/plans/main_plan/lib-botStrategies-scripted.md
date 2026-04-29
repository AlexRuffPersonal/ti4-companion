# lib-botStrategies-scripted

**File:** `src/lib/botStrategies/scripted.js`
**Status:** New
**Prereqs:** —

## Functionality

```pseudocode
// Returns { fnName: string, args: object } — the next edge function call for the bot to make.
// Returns null when the bot's turn is complete (no more actions).

export function getNextAction(game, players, botPlayer)
  phase = game.phase

  if phase === 'strategy':
    availableCards = strategy_cards filter not yet picked this round
    pick = availableCards sorted by initiative order → first
    return { fnName: 'game-play-strategy-card', args: { game_id, strategy_card: pick } }

  if phase === 'action':
    if botPlayer.passed: return null
    if bot has not yet activated a system this turn:
      return { fnName: 'game-activate-system', args: { game_id, system_key: botPlayer.home_system_key } }
    if bot can produce units (has production capacity):
      return { fnName: 'game-produce-units', args: { game_id, system_key: ..., units: minimal_legal_units } }
    return { fnName: 'game-player-pass', args: { game_id } }

  if phase === 'combat_assignment' (attacker or defender assign):
    casualties = required_hits ordered by: infantry first, then fighters, then other
    return { fnName: 'game-assign-hits', args: { game_id, combat_id, casualties } }

  if phase === 'combat_roll':
    return { fnName: 'game-roll-combat-dice', args: { game_id, combat_id } }

  if phase === 'status':
    return { fnName: 'game-player-pass', args: { game_id } }

  if phase === 'agenda':
    if bot has not voted:
      return { fnName: 'game-cast-votes', args: { game_id, outcome: 'For', votes: botPlayer.available_votes } }
    return null

  return null
```

## Tests

```pseudocode
getNextAction strategy phase: returns game-play-strategy-card with lowest-initiative card
getNextAction action phase (not activated): returns game-activate-system for home system
getNextAction action phase (activated, no production): returns game-player-pass
getNextAction action phase (already passed): returns null
getNextAction agenda phase (not voted): returns game-cast-votes For with all votes
getNextAction unknown phase: returns null
```
