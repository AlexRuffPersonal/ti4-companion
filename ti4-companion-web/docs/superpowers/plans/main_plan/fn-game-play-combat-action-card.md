# fn-game-play-combat-action-card

**File:** `supabase/functions/game-play-combat-action-card/index.ts`
**Status:** New
**Prereqs:** migration-036-combat-action-cards

## Functionality

```pseudocode
CORS; AUTH; BODY(game_code, combat_id, card_id, targets?)
GAME(id, phase, round); PLAYER; COMBAT

side = player.id === combat.attacker_player_id ? 'attacker' : 'defender'
if window_passes[side] === true: ERR('Already passed this window', 409)

// Verify player holds the card
card = query game_player_action_cards WHERE id=card_id AND player_id=player.id; 404 if missing
cardDef = query action_cards WHERE id=card.action_card_id; 404 if missing

// Phase timing check
if cardDef.name not valid for combat.phase: ERR('Card not valid in this timing window', 409)

// Same-name rule (LRR §2.6b): same card name + same target entity → reject
played = query game_player_action_cards_played WHERE combat_id + window_phase=combat.phase + card_name=cardDef.name
if played targeting same entity as targets: ERR('Same card already played against this target', 409)

// Per-card effects:

'Morale Boost':
  pending_effects.morale_boost_{side} = (pending_effects.morale_boost_{side} ?? 0) + 1

'Fighter Prototype':
  if combat.round !== 1: ERR('Fighter Prototype only valid in round 1', 409)
  pending_effects.fighter_prototype_{side} = true

'Shields Holding':
  if side is not the receiving player for this window: ERR('Not valid for this player', 409)
  pending_effects.shields_holding_{side} = (pending_effects.shields_holding_{side} ?? 0) + 2

'Waylay':
  if combat.phase !== 'window_pre_barrage': ERR(409)
  pending_effects.waylay_{side} = true

'Maneuvering Jets':
  if combat.phase !== 'window_space_cannon_assign': ERR(409)
  decrement attacker pending space cannon hits by 1 (min 0)

'Emergency Repairs':
  update game_player_units SET damaged=false WHERE game_id, system_key=combat.system_key, player_id=player.id

'Direct Hit':
  target = targets.unit_id; verify unit appears in combat.sustained_this_phase
  verify card played by the player whose units produced the hit
  unit = query game_player_units WHERE id=target
  if unit.count > 1: UPDATE game_player_units SET count=count-1
  else: DELETE game_player_units WHERE id=target
  re-evaluate win condition (if opponent has 0 ships: UPDATE game_combats SET status='complete', winner_player_id=player.id)

'Skilled Retreat':
  dest = targets.destination_system_key
  verify dest is adjacent (axial distance=1 or wormhole-connected) to combat.system_key
  verify dest contains no enemy ships (query game_player_units)
  move all player ships: UPDATE game_player_units SET system_key=dest WHERE player_id=player.id AND game_id AND system_key=combat.system_key AND on_planet IS NULL
  INSERT game_system_tokens (game_id, system_key=dest, player_id, token_type='retreat_cc')
  UPDATE game_combats SET status='complete'

'Rout':
  if side !== 'defender': ERR('Only defender can play Rout', 409)
  pending_effects.rout_active = true

'Intercept':
  if combat.retreat_declared_by IS NULL: ERR('No retreat to intercept', 409)
  if combat.retreat_declared_by === player.id: ERR('Cannot intercept own retreat', 409)
  UPDATE game_combats SET retreat_declared_by=NULL, retreat_destination=NULL

'Courageous To The End':
  destroyed = combat.destroyed_this_phase entry for player's ship
  if none: ERR(409)
  roll 2 d10s server-side; hits = count where roll >= destroyed.combat_value
  opponent_side = side === 'attacker' ? 'defender' : 'attacker'
  UPDATE game_combats SET {opponent_side}_hits = {opponent_side}_hits + hits,
    pending_effects.forced_hits_{opponent_side} = hits  // flagged sustain_allowed:false

'Experimental Battlestation':
  if !combat.ships_moved_in: ERR('No ships moved into system', 409)
  dock = query game_player_units WHERE id=targets.space_dock_unit_id AND unit_type='space_dock' AND player_id=player.id
  verify dock.system_key is adjacent to or === combat.system_key
  spaceCannon stat = query units WHERE name='space_dock' → space_cannon field
  roll dice; hits vs attacker fleet
  UPDATE game_combats SET attacker_hits=attacker_hits+hits

'In The Silence Of Space':
  if combat.phase !== 'window_pre_space_cannon': ERR(409)
  verify targets.system_key contains player's ships
  pending_effects.silent_space_system = targets.system_key
  re-run space cannon opportunity discovery including that system; append to space_cannon_pending

'Salvage':
  if combat.winner_player_id !== player.id: ERR('Only winner can play Salvage', 409)
  loser_id = side==='attacker' ? combat.defender_player_id : combat.attacker_player_id
  loser = query game_players WHERE id=loser_id
  UPDATE game_players SET commodities=game_players.commodities+loser.commodities WHERE id=player.id
  UPDATE game_players SET commodities=0 WHERE id=loser_id

// Discard card
DELETE game_player_action_cards WHERE id=card_id
// Record play for same-name rule tracking
INSERT game_player_action_cards_played (combat_id, window_phase, card_name, player_id, target_entity_id)

// Update pending_effects and reset opponent's pass so they can respond
UPDATE game_combats SET
  pending_effects=<updated>,
  window_passes=jsonb_set(window_passes, opponent_side, false)

OK({ phase: combat.phase })
```

## Tests

```pseudocode
STD_MOCKS; T401; T400(game_code, combat_id, card_id); TCORS; T404_PLAYER; T404_COMBAT

// Shields Holding
GIVEN phase='window_pre_assign_defender', player=defender, card=Shields Holding
  EXPECT pending_effects.shields_holding_defender=2
  EXPECT card deleted from hand

GIVEN Shields Holding played twice targeting same player's ships
  EXPECT 409 same-card-same-target

// Direct Hit
GIVEN phase='window_post_sustain', sustained_this_phase=[{unit_id:'u1'}], targets={unit_id:'u1'}
  unit has count=1
  EXPECT game_player_units row deleted
  EXPECT win condition re-evaluated

GIVEN targets.unit_id not in sustained_this_phase
  EXPECT 409

// Skilled Retreat
GIVEN phase='window_start_round', adjacent empty system
  EXPECT units moved to destination
  EXPECT game_system_tokens CC row inserted
  EXPECT game_combats status='complete'

GIVEN destination has enemy ships
  EXPECT 409

// Experimental Battlestation
GIVEN ships_moved_in=false
  EXPECT 409

// Courageous To The End — forced hits cannot be Sustained (flag set in pending_effects)
GIVEN destroyed_this_phase=[{unit_id:'u2', combat_value:7}], rolls=[8,4]
  EXPECT opponent hits incremented by 1 (only roll 8 >= 7)
  EXPECT pending_effects.forced_hits_opponent=1

// Rout — defender only
GIVEN phase='window_announce_retreat', side=attacker, card=Rout
  EXPECT 409

// Intercept — no retreat declared
GIVEN retreat_declared_by=NULL
  EXPECT 409
```
