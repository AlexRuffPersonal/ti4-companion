# fn-game-activate-system-p30

**File:** `supabase/functions/game-activate-system/index.ts`
**Status:** Modify
**Prereqs:** fn-game-activate-system-p20, migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — Tech effects on system activation and ship entry

```pseudocode
// Chaos Mapping validation (before activation)
if tile is asteroid field:
  saarPlayer = find player where 'Chaos Mapping' IN technologies
  if saarPlayer AND saarPlayer has units in that system:
    ERR 409 'Cannot activate asteroid field containing Saar ships'

// Aerie Hololattice: movement block
argent = find player where 'Aerie Hololattice' IN technologies
if argent AND argent has structures in that system:
  ERR 409 'Cannot move ships through system containing Argent structures'

// Lazax Gate Folding: passive wormhole treatment for Winnu
if activating player owns 'Lazax Gate Folding' AND NOT controlling Mecatol Rex:
  treat Mecatol Rex system as containing alpha + beta wormholes during adjacency checks

// Scanlink Drone Network: explore a planet in the activated system
if 'Scanlink Drone Network' IN player.technologies AND selections.scanlink_planet:
  trigger exploration of selections.scanlink_planet (same logic as game-explore-planet)

// Gravity Drive: +1 move to 1 ship
if 'Gravity Drive' IN player.technologies AND selections.gravity_drive_ship:
  apply +1 move to that ship for this tactical action (tracked in context, not persisted)

// Spacial Conduit Cylinder: exhaust to make another system adjacent
if 'Spacial Conduit Cylinder' IN player.technologies AND NOT exhausted AND selections.scc_system:
  UPDATE game_players SET exhausted_technologies = array_append(..., 'Spacial Conduit Cylinder')
  // system adjacency extended in movement validation for this action

// Aetherstream: +1 move if adjacent to anomaly
if 'Aetherstream' IN player.technologies OR 'Aetherstream' IN neighborTech:
  if any adjacent system is an anomaly:
    +1 move to all activating player's ships (or neighbor's, if neighbor owns it)

// SHIPS_ENTER_SYSTEM reactive effects (check all opponents)
for each opponent where opponent has units in activated system:
  if 'Voidwatch' IN player.technologies:  // player is Empyrean being entered
    if activating player has promissory notes:
      take 1 promissory note from activating player's hand
  if 'Neuroglaive' IN player.technologies:  // player is Naalu being entered
    UPDATE game_players SET command_tokens.fleet = MAX(0, fleet - 1) WHERE id=activating_player.id
  if 'E-Res Siphons' IN player.technologies:  // player is Jol-Nar being entered
    UPDATE game_players SET trade_goods += 4 WHERE id=player.id
  if 'Nullification Field' IN player.technologies AND NOT exhausted:
    open pending_action_window { type:'when_ships_enter_system',
      eligible:[player.id], context:{ activating_player_id } }
```

## Tests

```pseudocode
GIVEN Chaos Mapping owner has ships in asteroid field AND other player activates EXPECT 409
GIVEN Scanlink Drone Network owned EXPECT exploration triggered on selections.scanlink_planet
GIVEN Voidwatch owner has units in system, activating player has promissory notes EXPECT note transferred
GIVEN Neuroglaive owner has units in system EXPECT activating player loses 1 fleet token
GIVEN E-Res Siphons owner has units in system EXPECT Jol-Nar gains 4 TG
GIVEN Nullification Field unexhausted, ships enter system EXPECT window opened
```
