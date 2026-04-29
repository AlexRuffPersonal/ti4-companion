# lib-botStrategies-random

**File:** `src/lib/botStrategies/random.js`
**Status:** New
**Prereqs:** —

## Functionality

```pseudocode
// Same interface as scripted.js — returns { fnName, args } or null.
// Picks uniformly at random from legal options at each decision point.

export function getNextAction(game, players, botPlayer)
  phase = game.phase

  if phase === 'strategy':
    availableCards = strategy_cards filter not yet picked this round
    pick = random element from availableCards
    return { fnName: 'game-play-strategy-card', args: { game_id, strategy_card: pick } }

  if phase === 'action':
    if botPlayer.passed: return null
    if bot has not yet activated a system this turn:
      activatableSystems = all systems in map where activation is legal for bot
      system = random element from activatableSystems
      return { fnName: 'game-activate-system', args: { game_id, system_key: system } }
    // 50% chance to pass, 50% chance to activate another system (if any remain)
    remaining = activatableSystems not yet activated this round
    if remaining.length > 0 AND Math.random() > 0.5:
      return { fnName: 'game-activate-system', args: { game_id, system_key: random(remaining) } }
    return { fnName: 'game-player-pass', args: { game_id } }

  if phase === 'combat_assignment':
    // Random assignment from legal units (must assign exactly required_hits casualties)
    casualties = random_legal_casualty_selection(required_hits, available_units)
    return { fnName: 'game-assign-hits', args: { game_id, combat_id, casualties } }

  if phase === 'combat_roll':
    return { fnName: 'game-roll-combat-dice', args: { game_id, combat_id } }

  if phase === 'status':
    return { fnName: 'game-player-pass', args: { game_id } }

  if phase === 'agenda':
    if bot has not voted:
      outcome = random element from ['For', 'Against']
      votes = random integer from 1 to botPlayer.available_votes
      return { fnName: 'game-cast-votes', args: { game_id, outcome, votes } }
    return null

  return null
```

## Tests

```pseudocode
getNextAction strategy phase: returns game-play-strategy-card with a valid available card
getNextAction action phase (not activated): returns game-activate-system with a legal system
getNextAction action phase (already passed): returns null
getNextAction agenda phase (not voted): returns game-cast-votes with For or Against
getNextAction unknown phase: returns null
```
