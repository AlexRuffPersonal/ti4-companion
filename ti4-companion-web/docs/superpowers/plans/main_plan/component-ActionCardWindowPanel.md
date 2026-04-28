# component-ActionCardWindowPanel

**File:** `src/components/game/ActionCardWindowPanel.jsx`
**Status:** New
**Prereqs:** fn-game-play-combat-action-card, fn-game-pass-action-window

## Functionality

Rendered inside `SpaceCombatModal` whenever `combat.phase` starts with `window_`. Slides in above `FleetDisplay` without replacing it.

```pseudocode
Props: { combat, myPlayerId, windowCards, onPlayCard, onPass }

isWindowPhase = combat.phase.startsWith('window_')
if !isWindowPhase: return null

side = myPlayerId === combat.attacker_player_id ? 'attacker' : 'defender'
localPassed = combat.window_passes[side]
opponentPassed = combat.window_passes[side==='attacker' ? 'defender' : 'attacker']

LABEL(windowTitle(combat.phase))   // e.g. "Start of Round — play a card or pass"

// Card chips
FOR card IN windowCards:
  <chip onClick → openTargetPickerOrPlay(card)>
    card.name
  </chip>

// Target pickers (shown inline after chip tap):
IF selectedCard === 'Direct Hit':
  list units in combat.sustained_this_phase; user picks one → onPlayCard(cardId, {unit_id})

IF selectedCard === 'Skilled Retreat':
  list valid adjacent enemy-free systems → onPlayCard(cardId, {destination_system_key})

IF selectedCard === 'Experimental Battlestation':
  list player's eligible space docks → onPlayCard(cardId, {space_dock_unit_id})

IF selectedCard === 'In The Silence Of Space':
  system picker (systems with player ships) → onPlayCard(cardId, {system_key})

// Pass button
<btn disabled={localPassed} onClick → onPass()>Pass</btn>

IF localPassed AND !opponentPassed:
  MUTED("Waiting for opponent…")
```

Window title mapping:
```
window_pre_space_cannon      → "Before Space Cannon — play a card or pass"
window_space_cannon_assign   → "Space Cannon Hits — play a card or pass"
window_pre_barrage           → "Before Anti-Fighter Barrage — play a card or pass"
window_start_round           → "Start of Round — play a card or pass"
window_announce_retreat      → "Retreat Step — play a card or pass"
window_pre_assign_defender   → "Before Defender Assigns — play a card or pass"
window_post_sustain          → "Sustain Used — play a card or pass"
window_post_destroy          → "Ship Destroyed — play a card or pass"
window_pre_assign_attacker   → "Before Attacker Assigns — play a card or pass"
window_post_combat           → "Combat Over — play a card or pass"
```

## Tests

```pseudocode
// window_pre_assign_defender, player has Shields Holding in windowCards, not yet passed
  renders "Before Defender Assigns" title
  renders Shields Holding chip
  renders enabled Pass button
  clicking Shields Holding chip calls onPlayCard(cardId, undefined)
  clicking Pass calls onPass

// localPassed=true, opponentPassed=false
  Pass button disabled
  renders "Waiting for opponent…"

// Direct Hit chip selected, sustained_this_phase=[{unit_id:'u1', unit_type:'dreadnought'}]
  renders unit picker with dreadnought entry
  selecting unit calls onPlayCard(cardId, {unit_id:'u1'})

// combat.phase does not start with 'window_'
  renders null
```
