# shared-abilityDsl

**File:** `supabase/functions/_shared/abilityDsl.ts`
**Status:** Modify
**Prereqs:** migration-029-strategy-production

## Changes

Add the following op handlers to the DSL executor. Each op receives `(db, gameId, playerId, op, selections)`.

```pseudocode
case 'spend_strategy_token':
  fetch player command_tokens
  ERR 409 if command_tokens.strategy < 1
  update game_players SET command_tokens.strategy -= 1

case 'replenish_commodities':
  targetId = op.target === 'self' ? playerId : selections.chosen_player_id
  fetch factions.commodities for target player's faction
  update game_players SET commodities = factions.commodities WHERE id = targetId

case 'gain_trade_goods':
  update game_players SET trade_goods += op.amount WHERE id = playerId

case 'place_structure':
  planetName = selections.planet_name
  structureType = op.choices ? selections.structure_type : op.structure_type
  fetch game_player_planets row for (gameId, playerId, planetName)
  ERR 409 if planet not owned by player
  IF structureType === 'space_dock':
    ERR 409 if planet.space_dock_unit_id is not null ('Planet already has a space dock')
    unitId = fetch units WHERE name = 'Space Dock' (or faction variant from selections)
    update game_player_planets SET space_dock_unit_id = unitId
  IF structureType === 'pds':
    ERR 409 if planet.pds_count >= 2 ('Planet already has 2 PDS')
    update game_player_planets SET pds_count += 1

case 'ready_planets':
  amount = op.amount
  planetNames = selections.planet_names (array, length <= amount)
  ERR 409 if any planet not owned by player or not exhausted
  update game_player_planets SET exhausted = false WHERE planet_name IN planetNames

case 'set_speaker':
  newSpeakerId = selections.chosen_player_id
  ERR 409 if chosen player not in game
  update games SET speaker_player_id = newSpeakerId

case 'peek_agenda':
  count = op.count ?? 2
  fetch top `count` agenda deck cards by deck_position WHERE state = 'deck'
  return cards to caller as part of OK response for client-side reordering
  apply reordered deck_positions from selections.ordered_card_ids

case 'draw_action_card':
  fetch top action card by deck_position WHERE state = 'deck'
  ERR 409 if deck empty
  update game_action_card_deck SET state = 'hand', held_by_player_id = playerId, deck_position = null

case 'score_imperial_point':
  fetch game_player_planets WHERE player_id = playerId AND planet_name = 'Mecatol Rex'
  ERR 409 if not found ('You do not control Mecatol Rex')
  update game_players SET vp += 1 WHERE id = playerId

case 'draw_secret_objective':
  fetch top secret objective card by deck_position WHERE state = 'deck'
  ERR 409 if deck empty
  update game_player_secret_objectives SET state = 'held', held_by_player_id = playerId
```

### Phase 17 — Exploration & Relic ops

```pseudocode
case 'gain_commodities':
  amount = op.amount === 'max' ? faction.commodities_max : op.amount
  fetch player faction commodities_max
  update game_players SET commodities = MIN(commodities + amount, commodities_max)

case 'gain_relic_fragment':
  update game_exploration_decks SET state='held', resolved_by_player_id=playerId
         WHERE id=context.card_id
  // keep_card=true (Enigmatic Device): state stays 'held' permanently

case 'attach_to_planet':
  attachmentRow = select attachments where name=op.attachment
  ERR 409 'Attachment not found' if !attachmentRow
  update game_player_planets SET attachments = array_append(attachments, attachmentRow.id)
         WHERE game_id + player_id + planet_name=context.planet_name

case 'place_map_token':
  if op.token_type = 'gamma_wormhole':
    update game_system_state SET wormholes = array_append(wormholes, 'gamma')
           WHERE game_id + system_key=context.system_key
  if op.token_type = 'ion_storm':
    update game_system_state SET ion_storm = true
           WHERE game_id + system_key=context.system_key (upsert)

case 'place_mirage':
  // Insert Mirage as a new planet in the explored system
  tileId = TILE_ID(context.system_key, game)
  insert game_player_planets { game_id, player_id, planet_name:'Mirage', tile_id: tileId,
                                exhausted:false, explored:true }

case 'gain_relic':
  relicRow = select game_relic_deck where game_id + state='deck'
             ORDER BY deck_position ASC LIMIT 1
  ERR 409 'Relic deck empty' if !relicRow
  update game_relic_deck SET state='held', held_by_player_id=playerId WHERE id=relicRow.id

case 'explore_planet':
  // Delegates to the same draw+resolve logic as game-explore-planet/game-resolve-exploration-card
  // Used by Crown of Emphidia exhaust ability
  target planet = context.selections.planet_name
  [internal call: drawExplorationCard(gameId, playerId, target) → resolveExplorationCard(...)]

case 'choice':
  selectedOps = op.options[context.choice ?? 0]
  applyAbility(selectedOps, context, db)

case 'conditional_mech_or_infantry':
  hasMech = query game_player_units where game_id + player_id + on_planet=context.planet_name
            AND unit_type='mech' AND count > 0
  if hasMech:
    applyAbility(op.effect, context, db)
  elif context.remove_infantry:
    // Remove 1 infantry from planet
    infantryRow = select game_player_units where game_id + player_id + on_planet=context.planet_name
                  AND unit_type='infantry' AND count > 0
    ERR 409 'No infantry to remove' if !infantryRow
    update game_player_units SET count = count - 1 WHERE id=infantryRow.id
    delete if count becomes 0
    applyAbility(op.effect, context, db)
  // else: neither condition met, skip effect
```

## Phase 19 — DSL Completions

Add `CombatResolveContext` extending `ResolveContext` with `combatId`, `systemKey`, `side`.
Add `ignorePrerequisite?: boolean` to `ResolveContext` (set in-memory only, never from request).

Wire up the 12 remaining no-op stubs:

```pseudocode
case 'draw_secret_objective':
  fetch top game_player_secret_objectives WHERE state='deck' ORDER BY deck_position ASC
  ERR 409 'Secret objective deck is empty' if none
  update SET state='held', held_by_player_id=activatingPlayerId

case 'convert_commodities':
  ERR 409 'Insufficient commodities' if player.commodities < op.amount
  update game_players SET commodities -= op.amount, trade_goods += op.amount

case 'gain_command_tokens':
  bucket = op.bucket  // 'tactic_total' | 'fleet' | 'strategy'
  tokens = { ...player.command_tokens }; tokens[bucket] += op.amount ?? 1
  update game_players SET command_tokens = tokens
  // DB CHECK constraint enforces tactic_total + fleet + strategy <= 16

case 'take_from_discard':
  cardId = context.selections.card_id
  fetch game_action_card_deck WHERE id=cardId AND state='discard'
  ERR 409 'Card not found in discard' if not found
  update SET state='held', held_by_player_id=activatingPlayerId, deck_position=null
  update game_players SET action_card_count += 1

case 'ignore_prerequisite':
  context.ignorePrerequisite = true  // in-memory flag, no DB write

case 'gain_technology':
  techName = context.selections.technology_name
  fetch technologies WHERE name=techName (get technology_type + prerequisites)
  ERR 409 'Technology already researched' if techName in player.technologies
  if !context.ignorePrerequisite:
    fetch all technologies to count player held techs by technology_type colour
    prereqs = tech.prerequisites as Record<colour, count_needed>
    ERR 409 'Prerequisites not met' if any colour deficit > 0
  update game_players SET technologies = array_append(technologies, techName)

case 'cast_votes':
  fetch games WHERE id=gameId to get agenda_current_card_id
  voteCount = op.amount ?? context.selections.vote_count
  outcome = context.selections.vote_outcome
  upsert game_agenda_votes { game_id, game_player_id, agenda_id, vote_count, choice:outcome }
    ON CONFLICT (game_id, game_player_id, agenda_id)

case 'prevent_vote':
  targetId = op.target === 'self' ? activatingPlayerId : context.targetPlayerId
  update game_players SET vote_prevented = true WHERE id = targetId

// Combat ops — require CombatResolveContext (combatId, systemKey, side)
case 'cancel_hit':
  load game_combats row by combatId
  targetSide = op.target === 'self' ? side : opposite(side)
  hitsCol = targetSide === 'attacker' ? 'attacker_hits' : 'defender_hits'
  update game_combats SET <hitsCol> = GREATEST(0, <hitsCol> - 1)

case 'add_die':
  roll 1d10 server-side; hit = roll >= op.hit_on
  load game_combats row; append {unit_type:'__ability__', roll, hit_on:op.hit_on, hit} to side's dice
  if hit: increment side's hits

case 'modify_roll':
  load game_combats row; for each die in side's dice array:
    newRoll = die.roll + op.modifier; recompute hit = newRoll >= die.hit_on
  recount hits; update game_combats with updated dice + hits

case 'place_units':
  systemKey = context.selections.system_key ?? context.systemKey
  onPlanet = context.selections.planet_name ?? null
  upsert game_player_units { game_id, player_id, system_key, unit_type:op.unit_type, on_planet, count:op.count??1 }
    ON CONFLICT increment count

case 'destroy_units':
  fetch game_player_units row matching game_id, player_id, system_key, unit_type, on_planet
  ERR 409 'No units to destroy' if not found or count < requested
  decrement count; delete row if count reaches 0
```

## Phase 21 — Legendary Planet Abilities

Extend `place_mirage` op to also grant the Mirage legendary card:

```pseudocode
case 'place_mirage':
  tileId = TILE_ID(context.system_key, game)
  insert game_player_planets { game_id, player_id, planet_name:'mirage', tile_id: tileId,
                                exhausted:false, explored:true }
  // Phase 21 addition:
  GRANT_LEGENDARY_CARD(gameId, playerId, 'mirage')
```

Add `LEGENDARY_CARD_ABILITIES` lookup object (consumed by `game-resolve-ability`):

```pseudocode
export const LEGENDARY_CARD_ABILITIES: Record<string, Op[]> = {
  primor:    [{ op:'place_units', unit_type:'infantry', count:2, target:'any_controlled_planet' }],
  hopes_end: [{ op:'choice', options:[ [{op:'place_units',unit_type:'mech',count:1,target:'any_controlled_planet'}], [{op:'draw_action_card',count:1}] ] }],
  mallice:   [{ op:'choice', options:[ [{op:'gain_trade_goods',amount:2}], [{op:'convert_commodities',amount:'all'}] ] }],
  mirage:    [{ op:'place_units', unit_type:'fighter', count:2, target:'any_system_with_ships' }],
}
```

## Tests

No standalone test file — covered through `game-resolve-ability` and `tests/lib/abilityDsl.test.js` for each new op.
