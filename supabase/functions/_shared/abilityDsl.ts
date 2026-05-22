import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { EXPLORATION_EFFECTS } from './explorationEffects.ts'

export interface ResolveContext {
  gameId: string
  activatingPlayerId: string
  targetPlayerId?: string
  targetPlanetName?: string
  chosenAmount?: number
  chosenOption?: number
  selections?: Record<string, unknown>
  ignorePrerequisite?: boolean
  gameRound?: number
  strategyPlayId?: string
  gainedRelicName?: string
  drawnExplorationCard?: Record<string, unknown>
  noteInstanceId?: string
  noteOriginPlayerId?: string
}

export interface CombatResolveContext extends ResolveContext {
  combatId: string
  systemKey: string
  side: 'attacker' | 'defender'
}

type PlayerRow = Record<string, unknown>

export function dslError(message: string, status = 409): Error {
  const err = new Error(message)
  ;(err as Error & { status: number }).status = status
  return err
}

export async function interpretEffects(
  effects: unknown[],
  context: ResolveContext,
  db: SupabaseClient
): Promise<void> {
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, trade_goods, commodities, vp, technologies, action_card_count, command_tokens, faction')
    .eq('id', context.activatingPlayerId)
    .maybeSingle()

  if (playerError || !player) throw new Error('Failed to load player data')

  for (const rawEffect of effects) {
    await interpretOp(rawEffect as Record<string, unknown>, context, player as PlayerRow, db)
  }
}

async function interpretOp(
  op: Record<string, unknown>,
  context: ResolveContext,
  player: PlayerRow,
  db: SupabaseClient
): Promise<void> {
  const sel = context.selections ?? {}

  switch (op.op) {
    case 'gain_trade_goods': {
      const amount = resolveAmount(op.amount as number | string, context)
      const { error } = await db
        .from('game_players')
        .update({ trade_goods: (player.trade_goods as number) + amount })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_trade_goods failed: ${error.message}`)
      break
    }
    case 'spend_trade_goods': {
      const amount = resolveAmount(op.amount as number | string, context)
      const { error } = await db
        .from('game_players')
        .update({ trade_goods: Math.max(0, (player.trade_goods as number) - amount) })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`spend_trade_goods failed: ${error.message}`)
      break
    }
    case 'gain_commodities': {
      const amount = resolveAmount(op.amount as number | string, context)
      const { error } = await db
        .from('game_players')
        .update({ commodities: (player.commodities as number) + amount })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_commodities failed: ${error.message}`)
      break
    }
    case 'gain_vp': {
      const { error } = await db
        .from('game_players')
        .update({ vp: (player.vp as number) + (op.amount as number) })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_vp failed: ${error.message}`)
      break
    }
    case 'lose_vp': {
      const { error } = await db
        .from('game_players')
        .update({ vp: Math.max(0, (player.vp as number) - (op.amount as number)) })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`lose_vp failed: ${error.message}`)
      break
    }
    case 'draw_action_card': {
      const { data: topCard, error: deckError } = await db
        .from('game_action_card_deck')
        .select('id')
        .eq('game_id', context.gameId)
        .eq('state', 'deck')
        .order('deck_position', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (deckError) throw new Error(`draw_action_card: deck query failed: ${deckError.message}`)
      if (!topCard) break  // Empty deck — silently skip
      const { error: updateCardError } = await db
        .from('game_action_card_deck')
        .update({ state: 'held', held_by_player_id: context.activatingPlayerId, deck_position: null })
        .eq('id', (topCard as Record<string, string>).id)
      if (updateCardError) throw new Error(`draw_action_card: update failed: ${updateCardError.message}`)
      const { error: updateCountError } = await db
        .from('game_players')
        .update({ action_card_count: ((player.action_card_count as number) ?? 0) + 1 })
        .eq('id', context.activatingPlayerId)
      if (updateCountError) throw new Error(`draw_action_card: count update failed: ${updateCountError.message}`)
      break
    }
    case 'exhaust_planets': {
      // Exhausts all planets for the target player (trait filter requires named handler — see design spec).
      const targetId = op.target === 'chosen_player'
        ? (context.targetPlayerId ?? context.activatingPlayerId)
        : context.activatingPlayerId
      const { error } = await db
        .from('game_player_planets')
        .update({ exhausted: true })
        .eq('game_id', context.gameId)
        .eq('player_id', targetId)
      if (error) throw new Error(`exhaust_planets failed: ${error.message}`)
      break
    }
    case 'choose_one': {
      const options = op.options as unknown[]
      const chosenIndex = context.chosenOption ?? 0
      const chosenOp = options[chosenIndex]
      if (chosenOp) {
        await interpretOp(chosenOp as Record<string, unknown>, context, player, db)
      }
      break
    }
    case 'spend_strategy_token': {
      const tokens = (player.command_tokens ?? {}) as Record<string, number>
      if ((tokens.strategy ?? 0) < 1) throw dslError('Insufficient strategy tokens')
      const updated = { ...tokens, strategy: tokens.strategy - 1 }
      const { error } = await db
        .from('game_players')
        .update({ command_tokens: updated })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`spend_strategy_token failed: ${error.message}`)
      break
    }
    case 'replenish_commodities': {
      const targetId = op.target === 'self'
        ? context.activatingPlayerId
        : (sel.chosen_player_id as string ?? context.activatingPlayerId)
      const { data: targetPlayer, error: targetError } = await db
        .from('game_players')
        .select('faction')
        .eq('id', targetId)
        .maybeSingle()
      if (targetError || !targetPlayer) throw new Error('replenish_commodities: failed to load target player')
      const { data: faction, error: factionError } = await db
        .from('factions')
        .select('commodities')
        .eq('name', (targetPlayer as Record<string, unknown>).faction)
        .maybeSingle()
      if (factionError || !faction) throw new Error('replenish_commodities: failed to load faction')
      const { error } = await db
        .from('game_players')
        .update({ commodities: (faction as Record<string, number>).commodities })
        .eq('id', targetId)
      if (error) throw new Error(`replenish_commodities failed: ${error.message}`)
      break
    }
    case 'place_structure': {
      const planetName = sel.planet_name as string
      const structureType = op.choices ? (sel.structure_type as string) : (op.structure_type as string)
      if (!planetName) throw dslError('planet_name is required')
      if (!structureType) throw dslError('structure_type is required')

      const { data: planet, error: planetError } = await db
        .from('game_player_planets')
        .select('id, space_dock_unit_id, pds_count, player_id')
        .eq('game_id', context.gameId)
        .eq('planet_name', planetName)
        .maybeSingle()
      if (planetError) throw new Error(`place_structure: planet query failed: ${planetError.message}`)
      if (!planet) throw dslError('Planet not found or not owned by you')
      if ((planet as Record<string, unknown>).player_id !== context.activatingPlayerId) throw dslError('Planet not owned by you')

      if (structureType === 'space_dock') {
        if ((planet as Record<string, unknown>).space_dock_unit_id !== null) throw dslError('Planet already has a space dock')
        const { data: unitDef, error: unitError } = await db
          .from('units')
          .select('id')
          .eq('name', 'Space Dock')
          .maybeSingle()
        if (unitError || !unitDef) throw new Error('place_structure: Space Dock unit definition not found')
        const { error } = await db
          .from('game_player_planets')
          .update({ space_dock_unit_id: (unitDef as Record<string, string>).id })
          .eq('id', (planet as Record<string, string>).id)
        if (error) throw new Error(`place_structure: update failed: ${error.message}`)
      } else if (structureType === 'pds') {
        if (((planet as Record<string, number>).pds_count ?? 0) >= 2) throw dslError('Planet already has 2 PDS')
        const { error } = await db
          .from('game_player_planets')
          .update({ pds_count: ((planet as Record<string, number>).pds_count ?? 0) + 1 })
          .eq('id', (planet as Record<string, string>).id)
        if (error) throw new Error(`place_structure: update failed: ${error.message}`)
      }
      break
    }
    case 'ready_planets': {
      const planetNames = sel.planet_names as string[] ?? []
      if (planetNames.length === 0) break
      for (const name of planetNames) {
        const { data: planet, error: checkError } = await db
          .from('game_player_planets')
          .select('id, player_id, exhausted')
          .eq('game_id', context.gameId)
          .eq('planet_name', name)
          .maybeSingle()
        if (checkError) throw new Error(`ready_planets: query failed: ${checkError.message}`)
        if (!planet) throw dslError(`Planet ${name} not found`)
        if ((planet as Record<string, unknown>).player_id !== context.activatingPlayerId) throw dslError(`Planet ${name} not owned by you`)
        if (!(planet as Record<string, boolean>).exhausted) throw dslError(`Planet ${name} is not exhausted`)
      }
      const { error } = await db
        .from('game_player_planets')
        .update({ exhausted: false })
        .eq('game_id', context.gameId)
        .eq('player_id', context.activatingPlayerId)
        .in('planet_name', planetNames)
      if (error) throw new Error(`ready_planets failed: ${error.message}`)
      break
    }
    case 'set_speaker': {
      const newSpeakerId = sel.chosen_player_id as string
      if (!newSpeakerId) throw dslError('chosen_player_id is required')
      const { data: targetPlayer, error: targetError } = await db
        .from('game_players')
        .select('id')
        .eq('id', newSpeakerId)
        .eq('game_id', context.gameId)
        .maybeSingle()
      if (targetError) throw new Error(`set_speaker: query failed: ${targetError.message}`)
      if (!targetPlayer) throw dslError('Chosen player not in game')
      const { error } = await db
        .from('games')
        .update({ speaker_player_id: newSpeakerId })
        .eq('id', context.gameId)
      if (error) throw new Error(`set_speaker failed: ${error.message}`)
      break
    }
    case 'peek_agenda': {
      const count = (op.count as number) ?? 2
      const orderedIds = sel.ordered_card_ids as string[] | undefined
      if (!orderedIds || orderedIds.length === 0) break
      // Apply client-submitted reordering to top N deck cards
      const { data: topCards, error: deckError } = await db
        .from('game_agenda_deck')
        .select('id')
        .eq('game_id', context.gameId)
        .eq('state', 'deck')
        .order('deck_position', { ascending: true })
        .limit(count)
      if (deckError) throw new Error(`peek_agenda: query failed: ${deckError.message}`)
      const topIds = new Set(((topCards ?? []) as Array<{ id: string }>).map(c => c.id))
      for (let i = 0; i < orderedIds.length; i++) {
        const cardId = orderedIds[i]
        if (!topIds.has(cardId)) throw dslError('ordered_card_ids contains cards not at top of deck')
        const { error } = await db
          .from('game_agenda_deck')
          .update({ deck_position: i + 1 })
          .eq('id', cardId)
        if (error) throw new Error(`peek_agenda: reorder failed: ${error.message}`)
      }
      break
    }
    case 'score_imperial_point': {
      const { data: mecatol, error: mecatolError } = await db
        .from('game_player_planets')
        .select('id')
        .eq('game_id', context.gameId)
        .eq('player_id', context.activatingPlayerId)
        .eq('planet_name', 'Mecatol Rex')
        .maybeSingle()
      if (mecatolError) throw new Error(`score_imperial_point: query failed: ${mecatolError.message}`)
      if (!mecatol) throw dslError('You do not control Mecatol Rex')
      const { error } = await db
        .from('game_players')
        .update({ vp: (player.vp as number) + 1 })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`score_imperial_point failed: ${error.message}`)
      break
    }
    case 'draw_secret_objective': {
      const { data: topSecret, error: secretError } = await db
        .from('game_player_secret_objectives')
        .select('id')
        .eq('game_id', context.gameId)
        .eq('state', 'deck')
        .order('deck_position', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (secretError) throw new Error(`draw_secret_objective: query failed: ${secretError.message}`)
      if (!topSecret) throw dslError('Secret objective deck is empty')
      const { error } = await db
        .from('game_player_secret_objectives')
        .update({ state: 'held', player_id: context.activatingPlayerId, deck_position: null })
        .eq('id', (topSecret as Record<string, string>).id)
      if (error) throw new Error(`draw_secret_objective: update failed: ${error.message}`)
      break
    }
    case 'convert_commodities': {
      const amount = op.amount as number
      if ((player.commodities as number) < amount) throw dslError('Insufficient commodities')
      const { error } = await db.from('game_players')
        .update({ commodities: (player.commodities as number) - amount, trade_goods: (player.trade_goods as number) + amount })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`convert_commodities failed: ${error.message}`)
      break
    }

    case 'gain_command_tokens': {
      const bucket = op.bucket as string  // 'tactic_total' | 'fleet' | 'strategy'
      const tokens = { ...(player.command_tokens ?? {}) as Record<string, number> }
      tokens[bucket] = (tokens[bucket] ?? 0) + ((op.amount as number) ?? 1)
      const { error } = await db.from('game_players')
        .update({ command_tokens: tokens })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_command_tokens failed: ${error.message}`)
      break
    }

    case 'take_from_discard': {
      const selections = context.selections as Record<string, unknown>
      const cardIds: string[] = (selections?.card_ids as string[]) ?? (selections?.card_id ? [selections.card_id as string] : [])
      const maxCount = (op.count as number) ?? cardIds.length
      const idsToTake = cardIds.slice(0, maxCount)
      if (idsToTake.length === 0) throw dslError('card_id or card_ids is required in selections')
      for (const cardId of idsToTake) {
        const { data: card, error: findError } = await db.from('game_action_card_deck')
          .select('id')
          .eq('id', cardId)
          .eq('game_id', context.gameId)
          .eq('state', 'discard')
          .maybeSingle()
        if (findError) throw new Error(`take_from_discard: query failed: ${findError.message}`)
        if (!card) throw dslError(`Card ${cardId} not found in discard`)
        const { error } = await db.from('game_action_card_deck')
          .update({ state: 'held', held_by_player_id: context.activatingPlayerId, deck_position: null })
          .eq('id', cardId)
        if (error) throw new Error(`take_from_discard: update failed: ${error.message}`)
      }
      const { error: countError } = await db.from('game_players')
        .update({ action_card_count: (player.action_card_count as number ?? 0) + idsToTake.length })
        .eq('id', context.activatingPlayerId)
      if (countError) throw new Error(`take_from_discard: count update failed: ${countError.message}`)
      break
    }

    case 'ignore_prerequisite': {
      context.ignorePrerequisite = true  // in-memory flag only
      break
    }

    case 'gain_technology': {
      const techName = (context.selections as Record<string, unknown>)?.technology_name as string
      if (!techName) throw dslError('technology_name is required in selections')
      const techs = (player.technologies as string[]) ?? []
      if (techs.includes(techName)) throw dslError('Technology already researched')
      if (!context.ignorePrerequisite) {
        // Fetch technology prerequisites
        const { data: techDef, error: techError } = await db.from('technologies').select('prerequisites').eq('name', techName).maybeSingle()
        if (techError) throw new Error(`gain_technology: tech query failed: ${techError.message}`)
        if (techDef) {
          const prereqs = (techDef as { prerequisites?: Record<string, number> }).prerequisites ?? {}
          if (Object.keys(prereqs).length > 0) {
            // Count player's techs by colour
            const { data: allTechs } = await db.from('technologies').select('name, technology_type').in('name', techs)
            const colourCounts: Record<string, number> = {}
            for (const t of (allTechs ?? []) as { technology_type: string }[]) {
              colourCounts[t.technology_type] = (colourCounts[t.technology_type] ?? 0) + 1
            }
            for (const [colour, needed] of Object.entries(prereqs)) {
              if ((colourCounts[colour] ?? 0) < needed) throw dslError('Prerequisites not met')
            }
          }
        }
      }
      const { error } = await db.from('game_players')
        .update({ technologies: [...techs, techName] })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_technology failed: ${error.message}`)
      break
    }

    case 'cast_votes': {
      const { data: game, error: gameError } = await db.from('games').select('agenda_current_card_id').eq('id', context.gameId).maybeSingle()
      if (gameError || !game) throw new Error('cast_votes: failed to load game')
      const agendaId = (game as { agenda_current_card_id: string }).agenda_current_card_id
      const voteCount = (op.amount as number) ?? ((context.selections as Record<string, number>)?.vote_count ?? 0)
      const outcome = (context.selections as Record<string, string>)?.vote_outcome
      if (!outcome) throw dslError('vote_outcome is required in selections')
      const { error } = await db.from('game_agenda_votes')
        .upsert({ game_id: context.gameId, game_player_id: context.activatingPlayerId, agenda_id: agendaId, vote_count: voteCount, choice: outcome }, { onConflict: 'game_id,game_player_id,agenda_id' })
      if (error) throw new Error(`cast_votes failed: ${error.message}`)
      break
    }

    case 'prevent_vote': {
      const targetId = op.target === 'self' ? context.activatingPlayerId : (context.targetPlayerId ?? context.activatingPlayerId)
      const { error } = await db.from('game_players').update({ vote_prevented: true }).eq('id', targetId)
      if (error) throw new Error(`prevent_vote failed: ${error.message}`)
      break
    }

    // Combat ops — require CombatResolveContext
    case 'cancel_hit': {
      const ctx = context as CombatResolveContext
      const { data: combat, error: combatError } = await db.from('game_combats').select('*').eq('id', ctx.combatId).maybeSingle()
      if (combatError || !combat) throw new Error('cancel_hit: combat not found')
      const targetSide = (op.target === 'self') ? ctx.side : (ctx.side === 'attacker' ? 'defender' : 'attacker')
      const hitsCol = targetSide === 'attacker' ? 'attacker_hits' : 'defender_hits'
      const currentHits = (combat as Record<string, number>)[hitsCol] ?? 0
      const { error } = await db.from('game_combats')
        .update({ [hitsCol]: Math.max(0, currentHits - 1) })
        .eq('id', ctx.combatId)
      if (error) throw new Error(`cancel_hit failed: ${error.message}`)
      break
    }

    case 'add_die': {
      const ctx = context as CombatResolveContext
      const hitOn = op.hit_on as number ?? 6
      const roll = Math.floor(Math.random() * 10) + 1
      const hit = roll >= hitOn
      const { data: combat, error: combatError } = await db.from('game_combats').select('*').eq('id', ctx.combatId).maybeSingle()
      if (combatError || !combat) throw new Error('add_die: combat not found')
      const c = combat as Record<string, unknown>
      const diceCol = ctx.side === 'attacker' ? 'attacker_dice' : 'defender_dice'
      const hitsCol = ctx.side === 'attacker' ? 'attacker_hits' : 'defender_hits'
      const updatedDice = [...((c[diceCol] as unknown[]) ?? []), { unit_type: '__ability__', roll, hit_on: hitOn, hit }]
      const { error } = await db.from('game_combats')
        .update({ [diceCol]: updatedDice, [hitsCol]: ((c[hitsCol] as number) ?? 0) + (hit ? 1 : 0) })
        .eq('id', ctx.combatId)
      if (error) throw new Error(`add_die failed: ${error.message}`)
      break
    }

    case 'modify_roll': {
      const ctx = context as CombatResolveContext
      const modifier = op.modifier as number
      const { data: combat, error: combatError } = await db.from('game_combats').select('*').eq('id', ctx.combatId).maybeSingle()
      if (combatError || !combat) throw new Error('modify_roll: combat not found')
      const c = combat as Record<string, unknown>
      const diceCol = ctx.side === 'attacker' ? 'attacker_dice' : 'defender_dice'
      const hitsCol = ctx.side === 'attacker' ? 'attacker_hits' : 'defender_hits'
      const dice = ((c[diceCol] as Array<{ roll: number; hit_on: number; hit: boolean }>) ?? []).map(die => {
        const newRoll = die.roll + modifier
        return { ...die, roll: newRoll, hit: newRoll >= die.hit_on }
      })
      const hits = dice.filter(d => d.hit).length
      const { error } = await db.from('game_combats')
        .update({ [diceCol]: dice, [hitsCol]: hits })
        .eq('id', ctx.combatId)
      if (error) throw new Error(`modify_roll failed: ${error.message}`)
      break
    }

    case 'place_units': {
      const sel = context.selections as Record<string, unknown>
      const systemKey = (sel?.system_key as string) ?? (context as CombatResolveContext).systemKey
      const onPlanet = (sel?.planet_name as string) ?? null
      const unitType = op.unit_type as string
      const count = (op.count as number) ?? 1
      if (!systemKey) throw dslError('system_key is required')
      if (!unitType) throw dslError('unit_type is required')
      const { data: existing } = await db.from('game_player_units')
        .select('id, count')
        .eq('game_id', context.gameId)
        .eq('player_id', context.activatingPlayerId)
        .eq('system_key', systemKey)
        .eq('unit_type', unitType)
        .is('on_planet', onPlanet)
        .maybeSingle()
      if (existing) {
        const { error } = await db.from('game_player_units').update({ count: ((existing as { count: number }).count ?? 0) + count }).eq('id', (existing as { id: string }).id)
        if (error) throw new Error(`place_units: update failed: ${error.message}`)
      } else {
        const { error } = await db.from('game_player_units').insert({ game_id: context.gameId, player_id: context.activatingPlayerId, system_key: systemKey, unit_type: unitType, on_planet: onPlanet, count })
        if (error) throw new Error(`place_units: insert failed: ${error.message}`)
      }
      break
    }

    case 'destroy_units': {
      const sel = context.selections as Record<string, unknown>
      const systemKey = (sel?.system_key as string) ?? (context as CombatResolveContext).systemKey
      const onPlanet = (sel?.planet_name as string) ?? null
      const unitType = op.unit_type as string
      const count = (op.count as number) ?? 1
      const { data: existing } = await db.from('game_player_units')
        .select('id, count')
        .eq('game_id', context.gameId)
        .eq('player_id', context.activatingPlayerId)
        .eq('system_key', systemKey)
        .eq('unit_type', unitType)
        .is('on_planet', onPlanet)
        .maybeSingle()
      if (!existing || (existing as { count: number }).count < count) throw dslError('No units to destroy')
      const newCount = (existing as { count: number }).count - count
      if (newCount === 0) {
        const { error } = await db.from('game_player_units').delete().eq('id', (existing as { id: string }).id)
        if (error) throw new Error(`destroy_units: delete failed: ${error.message}`)
      } else {
        const { error } = await db.from('game_player_units').update({ count: newCount }).eq('id', (existing as { id: string }).id)
        if (error) throw new Error(`destroy_units: update failed: ${error.message}`)
      }
      break
    }

    case 'explore_planet': {
      const planetName = (context.selections as Record<string, unknown>)?.planet_name as string
      const deckType = (context.selections as Record<string, unknown>)?.deck_type as string
      if (!planetName) throw dslError('planet_name is required in selections')
      if (!deckType) throw dslError('deck_type is required in selections')
      // Validate player controls the planet
      const { data: controlledPlanet, error: controlError } = await db
        .from('game_player_planets')
        .select('id')
        .eq('game_id', context.gameId)
        .eq('player_id', context.activatingPlayerId)
        .eq('planet_name', planetName)
        .maybeSingle()
      if (controlError) throw new Error(`explore_planet: planet query failed: ${controlError.message}`)
      if (!controlledPlanet) throw dslError('Player does not control this planet')
      // Draw top card from exploration deck
      const { data: topCard, error: deckError } = await db
        .from('game_exploration_decks')
        .select('id, name, deck_type')
        .eq('game_id', context.gameId)
        .eq('deck_type', deckType)
        .eq('state', 'deck')
        .order('deck_position', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (deckError) throw new Error(`explore_planet: deck query failed: ${deckError.message}`)
      if (!topCard) throw dslError('Exploration deck is empty')
      const card = topCard as Record<string, unknown>
      // Mark card as resolved
      const { error: resolveError } = await db
        .from('game_exploration_decks')
        .update({ state: 'resolved', resolved_by_player_id: context.activatingPlayerId, deck_position: null })
        .eq('id', card.id as string)
      if (resolveError) throw new Error(`explore_planet: card resolve failed: ${resolveError.message}`)
      // Apply exploration effects if known
      const effects = EXPLORATION_EFFECTS[card.name as string]
      if (effects) {
        await interpretEffects(effects, context, db)
      }
      context.drawnExplorationCard = card
      break
    }

    case 'gain_relic': {
      // Draw the top relic from the relic deck and assign it to the player
      const { data: topRelic, error: deckError } = await db
        .from('game_relic_deck')
        .select('id, relic_id')
        .eq('game_id', context.gameId)
        .eq('state', 'deck')
        .order('deck_position', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (deckError) throw new Error(`gain_relic: deck query failed: ${deckError.message}`)
      if (!topRelic) break  // Empty relic deck — silently skip
      const topRelicRow = topRelic as Record<string, string>
      const { error: updateError } = await db
        .from('game_relic_deck')
        .update({ state: 'held', held_by_player_id: context.activatingPlayerId, deck_position: null })
        .eq('id', topRelicRow.id)
      if (updateError) throw new Error(`gain_relic: update failed: ${updateError.message}`)
      // Fetch relic name and set on context for on-gain effects
      const { data: relicDef, error: relicDefError } = await db
        .from('relics')
        .select('name')
        .eq('id', topRelicRow.relic_id)
        .maybeSingle()
      if (!relicDefError && relicDef) {
        context.gainedRelicName = (relicDef as Record<string, string>).name
      }
      break
    }

    case 'exhaust_planet': {
      const planetName = ((context.selections as Record<string, unknown>)?.planet_name as string)
      if (!planetName) throw dslError('planet_name is required')
      const { data: planet, error: findError } = await db.from('game_player_planets')
        .select('id').eq('game_id', context.gameId).eq('player_id', context.activatingPlayerId).eq('planet_name', planetName).maybeSingle()
      if (findError) throw new Error(`exhaust_planet: query failed: ${findError.message}`)
      if (!planet) throw dslError('Planet not owned')
      const { error } = await db.from('game_player_planets').update({ exhausted: true }).eq('id', (planet as { id: string }).id)
      if (error) throw new Error(`exhaust_planet failed: ${error.message}`)
      break
    }

    case 'destroy_units_on_planet': {
      const sel = context.selections as Record<string, unknown>
      const planetName = sel?.planet_name as string
      const unitType = op.unit_type as string
      const count = op.count as number
      const upTo = op.up_to as boolean ?? false
      const { data: row } = await db.from('game_player_units')
        .select('id, count').eq('game_id', context.gameId).eq('player_id', context.activatingPlayerId).eq('on_planet', planetName).eq('unit_type', unitType).maybeSingle()
      if (!upTo && (!row || (row as { count: number }).count < count)) throw dslError('Not enough units')
      const toDestroy = Math.min(count, (row as { count: number } | null)?.count ?? 0)
      if (toDestroy > 0) {
        const newCount = ((row as { count: number }).count) - toDestroy
        if (newCount === 0) { await db.from('game_player_units').delete().eq('id', (row as { id: string }).id) }
        else { await db.from('game_player_units').update({ count: newCount }).eq('id', (row as { id: string }).id) }
      }
      break
    }

    case 'roll_and_destroy_units': {
      const sel = context.selections as Record<string, unknown>
      const targetPlayerId = sel?.target_player_id as string
      const planetName = sel?.planet_name as string
      const unitType = op.unit_type as string
      const threshold = op.threshold as number
      const { data: row } = await db.from('game_player_units')
        .select('id, count').eq('game_id', context.gameId).eq('player_id', targetPlayerId).eq('on_planet', planetName).eq('unit_type', unitType).maybeSingle()
      if (!row || (row as { count: number }).count === 0) throw dslError('No units on planet')
      let destroyed = 0
      for (let i = 0; i < (row as { count: number }).count; i++) {
        const roll = Math.floor(Math.random() * 10) + 1
        if (roll <= threshold) destroyed++
      }
      const newCount = (row as { count: number }).count - destroyed
      if (newCount === 0) { await db.from('game_player_units').delete().eq('id', (row as { id: string }).id) }
      else if (destroyed > 0) { await db.from('game_player_units').update({ count: newCount }).eq('id', (row as { id: string }).id) }
      break
    }

    case 'steal_action_card': {
      const targetPlayerId = ((context.selections as Record<string, unknown>)?.target_player_id as string)
      if (!targetPlayerId) throw dslError('target_player_id required')
      const { data: card } = await db.from('game_action_card_deck')
        .select('id').eq('game_id', context.gameId).eq('held_by_player_id', targetPlayerId).eq('state', 'hand')
        .limit(1).maybeSingle()
      if (!card) throw dslError('Target has no cards')
      await db.from('game_action_card_deck').update({ held_by_player_id: context.activatingPlayerId }).eq('id', (card as { id: string }).id)
      await db.from('game_players').update({ action_card_count: (player.action_card_count as number ?? 0) + 1 }).eq('id', context.activatingPlayerId)
      const { data: target } = await db.from('game_players').select('action_card_count').eq('id', targetPlayerId).maybeSingle()
      await db.from('game_players').update({ action_card_count: Math.max(0, ((target as { action_card_count: number } | null)?.action_card_count ?? 1) - 1) }).eq('id', targetPlayerId)
      break
    }

    case 'look_at_hand': {
      // No DB write — return cards in OK response (caller receives via response body)
      // This is handled at the game-resolve-ability level; DSL just marks it for special handling
      break
    }

    case 'modify_next_production': {
      const { error } = await db.from('game_players')
        .update({ production_bonus: ((player as Record<string, unknown>).production_bonus as number ?? 0) + (op.amount as number) })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`modify_next_production failed: ${error.message}`)
      break
    }

    case 'block_system_movement': {
      const systemKey = ((context.selections as Record<string, unknown>)?.system_key as string)
      if (!systemKey) throw dslError('system_key required')
      const { data: game } = await db.from('games').select('movement_blocked_systems').eq('id', context.gameId).maybeSingle()
      const blocked = ((game as { movement_blocked_systems?: string[] } | null)?.movement_blocked_systems ?? [])
      const { error } = await db.from('games').update({ movement_blocked_systems: [...blocked, systemKey] }).eq('id', context.gameId)
      if (error) throw new Error(`block_system_movement failed: ${error.message}`)
      break
    }

    case 'place_unit_no_move': {
      const sel = context.selections as Record<string, unknown>
      const systemKey = sel?.system_key as string
      const unitType = (op.unit_type as string) ?? 'destroyer'
      if (!systemKey) throw dslError('system_key required')
      const { data: existing } = await db.from('game_player_units')
        .select('id, count').eq('game_id', context.gameId).eq('player_id', context.activatingPlayerId)
        .eq('system_key', systemKey).eq('unit_type', unitType).is('on_planet', null).maybeSingle()
      if (existing) {
        await db.from('game_player_units').update({ count: ((existing as { count: number }).count ?? 0) + 1, no_move_this_round: true }).eq('id', (existing as { id: string }).id)
      } else {
        await db.from('game_player_units').insert({ game_id: context.gameId, player_id: context.activatingPlayerId, system_key: systemKey, unit_type: unitType, on_planet: null, count: 1, no_move_this_round: true })
      }
      break
    }

    case 'remove_tokens_from_board': {
      const targetPlayerId = ((context.selections as Record<string, unknown>)?.target_player_id as string)
      if (!targetPlayerId) throw dslError('target_player_id required')
      const { data: game } = await db.from('games').select('round').eq('id', context.gameId).maybeSingle()
      const { error } = await db.from('game_system_activations')
        .delete().eq('game_id', context.gameId).eq('player_id', targetPlayerId).eq('round', (game as { round: number } | null)?.round ?? 1)
      if (error) throw new Error(`remove_tokens_from_board failed: ${error.message}`)
      break
    }

    case 'swap_strategy_cards': {
      const targetPlayerId = ((context.selections as Record<string, unknown>)?.target_player_id as string)
      if (!targetPlayerId) throw dslError('target_player_id required')
      const { data: myRow } = await db.from('game_strategy_card_assignments').select('id, strategy_card_id').eq('game_id', context.gameId).eq('player_id', context.activatingPlayerId).maybeSingle()
      const { data: theirRow } = await db.from('game_strategy_card_assignments').select('id, strategy_card_id').eq('game_id', context.gameId).eq('player_id', targetPlayerId).maybeSingle()
      if (!myRow || !theirRow) throw dslError('Strategy card not assigned')
      const myR = myRow as { id: string; strategy_card_id: string }
      const theirR = theirRow as { id: string; strategy_card_id: string }
      await db.from('game_strategy_card_assignments').update({ strategy_card_id: theirR.strategy_card_id }).eq('id', myR.id)
      await db.from('game_strategy_card_assignments').update({ strategy_card_id: myR.strategy_card_id }).eq('id', theirR.id)
      break
    }

    case 'replace_agenda': {
      const { data: game, error: gameError } = await db.from('games').select('agenda_current_card_id').eq('id', context.gameId).maybeSingle()
      if (gameError || !game) throw new Error('replace_agenda: failed to load game')
      const currentAgendaId = (game as { agenda_current_card_id: string }).agenda_current_card_id
      // Discard current agenda
      await db.from('game_agenda_deck').update({ state: 'discard' }).eq('id', currentAgendaId)
      // Draw next from deck
      const { data: newCard, error: drawError } = await db.from('game_agenda_deck')
        .select('id')
        .eq('game_id', context.gameId)
        .eq('state', 'deck')
        .order('deck_position', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (drawError) throw new Error('replace_agenda: deck query failed')
      if (!newCard) throw dslError('Agenda deck empty')
      await db.from('game_agenda_deck').update({ state: 'revealed' }).eq('id', (newCard as { id: string }).id)
      await db.from('games').update({ agenda_current_card_id: (newCard as { id: string }).id }).eq('id', context.gameId)
      break
    }

    case 'add_votes': {
      const voteCount = (context.selections as Record<string, unknown>)?.vote_count as number
      const outcome = (context.selections as Record<string, unknown>)?.vote_outcome as string
      if (!outcome) throw dslError('vote_outcome required')
      if ((player.trade_goods as number) < voteCount) throw dslError('Insufficient trade goods')
      await db.from('game_players').update({ trade_goods: (player.trade_goods as number) - voteCount }).eq('id', context.activatingPlayerId)
      const { data: gameForVotes } = await db.from('games').select('agenda_current_card_id').eq('id', context.gameId).maybeSingle()
      const agendaId = (gameForVotes as { agenda_current_card_id: string } | null)?.agenda_current_card_id
      await db.from('game_agenda_votes').upsert(
        { game_id: context.gameId, game_player_id: context.activatingPlayerId, agenda_id: agendaId, vote_count: voteCount, choice: outcome },
        { onConflict: 'game_id,game_player_id,agenda_id' }
      )
      break
    }

    case 'research_same_technology': {
      const techName = (context as Record<string, unknown>).technology_name as string
      if (!techName) throw dslError('technology_name required in context')
      const techs = (player.technologies as string[]) ?? []
      if (techs.includes(techName)) throw dslError('Technology already researched')
      await db.from('game_players').update({ technologies: [...techs, techName] }).eq('id', context.activatingPlayerId)
      break
    }

    case 'spend_influence_for_tokens': {
      const planetIds = ((sel.influence_planet_ids as string[]) ?? [])
      if (planetIds.length === 0) break
      const pool = (sel.token_pool as string) ?? 'tactic_total'
      const { data: planets } = await db
        .from('game_player_planets')
        .select('id, player_id, influence')
        .eq('game_id', context.gameId)
        .in('planet_name', planetIds)
      const owned = (planets ?? []).filter((p: Record<string, unknown>) => p.player_id === context.activatingPlayerId)
      if (owned.length !== planetIds.length) throw dslError('Planet not owned')
      const totalInfluence = owned.reduce((sum: number, p: Record<string, unknown>) => sum + ((p.influence as number) ?? 0), 0)
      const tokenCount = Math.floor(totalInfluence / 3)
      const planetRowIds = owned.map((p: Record<string, unknown>) => p.id as string)
      await db.from('game_player_planets').update({ exhausted: true }).in('id', planetRowIds)
      if (tokenCount > 0) {
        const tokens = player.command_tokens as Record<string, number>
        await db.from('game_players').update({
          command_tokens: { ...tokens, [pool]: (tokens[pool] ?? 0) + tokenCount }
        }).eq('id', context.activatingPlayerId)
      }
      break
    }

    case 'diplomacy_lock_system': {
      const systemCoords = sel.target_system_coords as string
      if (!systemCoords) throw dslError('target_system_coords required')
      const { data: otherPlayers } = await db
        .from('game_players')
        .select('id, command_tokens')
        .eq('game_id', context.gameId)
        .neq('id', context.activatingPlayerId)
      const gameRound = context.gameRound ?? 1
      for (const op of (otherPlayers ?? []) as Array<Record<string, unknown>>) {
        const { data: existing } = await db
          .from('game_system_activations')
          .select('id')
          .eq('game_id', context.gameId)
          .eq('player_id', op.id as string)
          .eq('system_key', systemCoords)
          .maybeSingle()
        if (existing) continue
        await db.from('game_system_activations').insert({
          game_id: context.gameId,
          player_id: op.id as string,
          system_key: systemCoords,
          round: gameRound,
          token_owner_id: op.id as string,
        })
        // Decrement one token from their command sheet (tactic_total first, then fleet, then strategy)
        const tokens = (op.command_tokens as Record<string, number>) ?? {}
        if ((tokens.tactic_total ?? 0) > 0) {
          await db.from('game_players').update({ command_tokens: { ...tokens, tactic_total: tokens.tactic_total - 1 } }).eq('id', op.id as string)
        } else if ((tokens.fleet ?? 0) > 0) {
          await db.from('game_players').update({ command_tokens: { ...tokens, fleet: tokens.fleet - 1 } }).eq('id', op.id as string)
        } else if ((tokens.strategy ?? 0) > 0) {
          await db.from('game_players').update({ command_tokens: { ...tokens, strategy: tokens.strategy - 1 } }).eq('id', op.id as string)
        }
      }
      break
    }

    case 'grant_free_secondary': {
      const playerIds = (sel.free_secondary_player_ids as string[]) ?? []
      const playId = context.strategyPlayId
      if (!playId || playerIds.length === 0) break
      await db.from('game_strategy_card_plays').update({ free_secondary_player_ids: playerIds }).eq('id', playId)
      break
    }

    case 'warfare_remove_board_token': {
      const systemCoords = sel.remove_from_system_coords as string
      if (!systemCoords) throw dslError('remove_from_system_coords required')
      const pool = (sel.remove_to_pool as string) ?? 'tactic_total'
      const gameRound2 = context.gameRound ?? 1
      const { data: activation } = await db
        .from('game_system_activations')
        .select('id')
        .eq('game_id', context.gameId)
        .eq('player_id', context.activatingPlayerId)
        .eq('system_key', systemCoords)
        .eq('round', gameRound2)
        .maybeSingle()
      if (!activation) throw dslError('No token to remove from that system')
      await db.from('game_system_activations').delete().eq('id', (activation as Record<string, unknown>).id as string)
      const tokens = player.command_tokens as Record<string, number>
      await db.from('game_players').update({
        command_tokens: { ...tokens, [pool]: (tokens[pool] ?? 0) + 1 }
      }).eq('id', context.activatingPlayerId)
      break
    }

    case 'warfare_redistribute_tokens': {
      const tactic = sel.redistribution_tactic as number
      const fleet2 = sel.redistribution_fleet as number
      const strategy2 = sel.redistribution_strategy as number
      if (tactic === undefined || fleet2 === undefined || strategy2 === undefined) throw dslError('redistribution values required')
      if (tactic + fleet2 + strategy2 > 16) throw dslError('Token total exceeds 16')
      await db.from('game_players').update({
        command_tokens: { tactic_total: tactic, fleet: fleet2, strategy: strategy2 }
      }).eq('id', context.activatingPlayerId)
      break
    }

    case 'score_public_objective': {
      const objectiveId = sel.public_objective_id as string
      if (!objectiveId) break
      // Check that the game objective is revealed
      const { data: gameObj } = await db
        .from('game_public_objectives')
        .select('id, state, scored_by, objective_id')
        .eq('id', objectiveId)
        .eq('game_id', context.gameId)
        .maybeSingle()
      if (!gameObj || (gameObj as Record<string, unknown>).state !== 'revealed') throw dslError('Objective not available')
      const scoredBy = ((gameObj as Record<string, unknown>).scored_by as string[]) ?? []
      if (scoredBy.includes(context.activatingPlayerId)) throw dslError('Already scored this objective')
      const { data: refObj } = await db
        .from('public_objectives')
        .select('points')
        .eq('id', (gameObj as Record<string, unknown>).objective_id as string)
        .single()
      const points = ((refObj as Record<string, unknown> | null)?.points as number) ?? 1
      await db.from('game_public_objectives').update({
        scored_by: [...scoredBy, context.activatingPlayerId]
      }).eq('id', objectiveId)
      await db.from('game_players').update({ vp: (player.vp as number) + points }).eq('id', context.activatingPlayerId)
      break
    }

    case 'convert_all_commodities': {
      const count = player.commodities as number
      if (count > 0) {
        const { error } = await db.from('game_players')
          .update({ commodities: 0, trade_goods: (player.trade_goods as number) + count })
          .eq('id', context.activatingPlayerId)
        if (error) throw new Error(`convert_all_commodities failed: ${error.message}`)
      }
      break
    }

    case 'spend_commodities': {
      const amount = op.amount as number
      if ((player.commodities as number) < amount) throw dslError('Insufficient commodities')
      const { error } = await db.from('game_players')
        .update({ commodities: (player.commodities as number) - amount })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`spend_commodities failed: ${error.message}`)
      break
    }

    case 'gain_command_token_choice': {
      const bucket = (context.selections?.command_token_bucket as string) ?? 'tactic_total'
      if (!['tactic_total', 'fleet', 'strategy'].includes(bucket)) throw dslError('Invalid command token bucket')
      const tokens = { ...(player.command_tokens ?? {}) as Record<string, number> }
      tokens[bucket] = (tokens[bucket] ?? 0) + 1
      const { error } = await db.from('game_players')
        .update({ command_tokens: tokens })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_command_token_choice failed: ${error.message}`)
      break
    }

    case 'purge_relic_fragments': {
      const fragmentType = context.selections?.fragment_type as string | undefined
      if (!fragmentType || !['cultural', 'hazardous', 'industrial'].includes(fragmentType)) {
        throw dslError('fragment_type must be cultural, hazardous, or industrial', 400)
      }
      const count = op.count as number
      const { data: fragments, error: fragError } = await db
        .from('game_exploration_decks')
        .select('id')
        .eq('game_id', context.gameId)
        .eq('resolved_by_player_id', context.activatingPlayerId)
        .eq('relic_fragment_type', fragmentType)
        .eq('state', 'held')
        .limit(count)
      if (fragError) throw new Error(`purge_relic_fragments: query failed: ${fragError.message}`)
      const rows = (fragments ?? []) as Array<{ id: string }>
      if (rows.length < count) throw dslError('Insufficient relic fragments')
      const ids = rows.map(r => r.id)
      const { error: updateError } = await db
        .from('game_exploration_decks')
        .update({ state: 'discarded', resolved_by_player_id: null })
        .in('id', ids)
      if (updateError) throw new Error(`purge_relic_fragments: update failed: ${updateError.message}`)
      break
    }

    // ── Phase 43a ops ────────────────────────────────────────────────────────

    case 'reclaim_command_tokens': {
      // Fetch and delete all activation rows for this player across the board
      const { data: activations, error: actFetchError } = await db
        .from('game_system_activations')
        .select('id')
        .eq('game_id', context.gameId)
        .eq('player_id', context.activatingPlayerId)
      if (actFetchError) throw new Error(`reclaim_command_tokens: fetch failed: ${actFetchError.message}`)
      const actRows = (activations ?? []) as Array<{ id: string }>
      if (actRows.length > 0) {
        const ids = actRows.map(r => r.id)
        const { error: deleteError } = await db
          .from('game_system_activations')
          .delete()
          .in('id', ids)
        if (deleteError) throw new Error(`reclaim_command_tokens: delete failed: ${deleteError.message}`)
      }
      break
    }

    case 'produce_in_systems_with_ground_forces': {
      // Arborec hero: produce units in any system containing player's ground forces
      const { data: groundForceRows, error: gfError } = await db
        .from('game_player_units')
        .select('system_key')
        .eq('game_id', context.gameId)
        .eq('player_id', context.activatingPlayerId)
        .in('unit_type', ['infantry', 'mech'])
        .not('on_planet', 'is', null)
      if (gfError) throw new Error(`produce_in_systems_with_ground_forces: query failed: ${gfError.message}`)
      const validSystems = new Set(
        ((groundForceRows ?? []) as Array<{ system_key: string }>).map(r => r.system_key)
      )
      const produceList = (context.selections?.produce_list ?? []) as Array<{ system_key: string; unit_type: string; count: number }>
      for (const entry of produceList) {
        if (!validSystems.has(entry.system_key)) throw dslError('System has no ground forces')
        const { data: existing, error: existError } = await db
          .from('game_player_units')
          .select('id, count')
          .eq('game_id', context.gameId)
          .eq('player_id', context.activatingPlayerId)
          .eq('system_key', entry.system_key)
          .eq('unit_type', entry.unit_type)
          .is('on_planet', null)
          .maybeSingle()
        if (existError) throw new Error(`produce_in_systems_with_ground_forces: unit query failed: ${existError.message}`)
        if (existing) {
          const { error } = await db
            .from('game_player_units')
            .update({ count: ((existing as { count: number }).count ?? 0) + entry.count })
            .eq('id', (existing as { id: string }).id)
          if (error) throw new Error(`produce_in_systems_with_ground_forces: update failed: ${error.message}`)
        } else {
          const { error } = await db
            .from('game_player_units')
            .insert({ game_id: context.gameId, player_id: context.activatingPlayerId, system_key: entry.system_key, unit_type: entry.unit_type, on_planet: null, count: entry.count })
          if (error) throw new Error(`produce_in_systems_with_ground_forces: insert failed: ${error.message}`)
        }
      }
      break
    }

    case 'produce_units_free': {
      // Hacan hero: flag downstream production as free (no resource cost)
      ;(context as Record<string, unknown>).free_production = true
      break
    }

    case 'explore_planet_free': {
      // Naaz-Rokha commander: scaffold — set flag for caller to handle exploration
      const planetName = context.selections?.planet_name as string
      if (!planetName) throw dslError('planet_name is required', 400)
      const { data: controlled, error: controlError } = await db
        .from('game_player_planets')
        .select('id')
        .eq('game_id', context.gameId)
        .eq('player_id', context.activatingPlayerId)
        .eq('planet_name', planetName)
        .maybeSingle()
      if (controlError) throw new Error(`explore_planet_free: query failed: ${controlError.message}`)
      if (!controlled) throw dslError('Planet not controlled')
      // Set flag for caller to handle the actual card draw
      ;(context as Record<string, unknown>).explore_planet_name = planetName
      break
    }

    case 'replace_ship': {
      // Arborec agent: replace a non-fighter ship with one costing at most 2 more
      const targetPlayerId = context.selections?.chosen_player_id as string
      const sourceSystemKey = context.selections?.system_key as string
      const oldUnitType = context.selections?.old_unit_type as string
      const newUnitType = context.selections?.new_unit_type as string
      if (!targetPlayerId || !sourceSystemKey || !oldUnitType || !newUnitType) {
        throw dslError('chosen_player_id, system_key, old_unit_type, and new_unit_type are required', 400)
      }
      // Fetch unit definitions for cost comparison
      const { data: oldDef, error: oldDefError } = await db
        .from('units')
        .select('cost')
        .eq('name', oldUnitType)
        .maybeSingle()
      if (oldDefError || !oldDef) throw new Error(`replace_ship: old unit def not found for ${oldUnitType}`)
      const { data: newDef, error: newDefError } = await db
        .from('units')
        .select('cost')
        .eq('name', newUnitType)
        .maybeSingle()
      if (newDefError || !newDef) throw new Error(`replace_ship: new unit def not found for ${newUnitType}`)
      if ((newDef as { cost: number }).cost > (oldDef as { cost: number }).cost + 2) {
        throw dslError('New unit must cost at most 2 more')
      }
      // Fetch the source unit row
      const { data: sourceUnit, error: sourceError } = await db
        .from('game_player_units')
        .select('id, count')
        .eq('game_id', context.gameId)
        .eq('player_id', targetPlayerId)
        .eq('system_key', sourceSystemKey)
        .eq('unit_type', oldUnitType)
        .is('on_planet', null)
        .maybeSingle()
      if (sourceError) throw new Error(`replace_ship: source query failed: ${sourceError.message}`)
      if (!sourceUnit) throw dslError('Source unit not found')
      // Decrement old unit (delete if count drops to 0)
      const oldCount = (sourceUnit as { count: number }).count
      if (oldCount <= 1) {
        const { error: deleteError } = await db
          .from('game_player_units')
          .delete()
          .eq('id', (sourceUnit as { id: string }).id)
        if (deleteError) throw new Error(`replace_ship: delete old unit failed: ${deleteError.message}`)
      } else {
        const { error: decrementError } = await db
          .from('game_player_units')
          .update({ count: oldCount - 1 })
          .eq('id', (sourceUnit as { id: string }).id)
        if (decrementError) throw new Error(`replace_ship: decrement failed: ${decrementError.message}`)
      }
      // Upsert new unit in same system
      const { data: existingNew, error: existNewError } = await db
        .from('game_player_units')
        .select('id, count')
        .eq('game_id', context.gameId)
        .eq('player_id', targetPlayerId)
        .eq('system_key', sourceSystemKey)
        .eq('unit_type', newUnitType)
        .is('on_planet', null)
        .maybeSingle()
      if (existNewError) throw new Error(`replace_ship: new unit query failed: ${existNewError.message}`)
      if (existingNew) {
        const { error } = await db
          .from('game_player_units')
          .update({ count: ((existingNew as { count: number }).count ?? 0) + 1 })
          .eq('id', (existingNew as { id: string }).id)
        if (error) throw new Error(`replace_ship: new unit update failed: ${error.message}`)
      } else {
        const { error } = await db
          .from('game_player_units')
          .insert({ game_id: context.gameId, player_id: targetPlayerId, system_key: sourceSystemKey, unit_type: newUnitType, on_planet: null, count: 1 })
        if (error) throw new Error(`replace_ship: new unit insert failed: ${error.message}`)
      }
      break
    }

    case 'give_promissory_to_opponent': {
      // Mentak commander: opponent gives 1 promissory note to activating player
      const opponentId = context.selections?.chosen_player_id as string
      const noteId = context.selections?.note_id as string
      if (!opponentId || !noteId) throw dslError('chosen_player_id and note_id are required', 400)
      const { data: note, error: noteError } = await db
        .from('game_player_promissory_notes')
        .select('id')
        .eq('id', noteId)
        .eq('held_by_player_id', opponentId)
        .eq('state', 'hand')
        .maybeSingle()
      if (noteError) throw new Error(`give_promissory_to_opponent: query failed: ${noteError.message}`)
      if (!note) throw dslError('Note not found in opponent hand')
      const { error: transferError } = await db
        .from('game_player_promissory_notes')
        .update({ held_by_player_id: context.activatingPlayerId })
        .eq('id', noteId)
      if (transferError) throw new Error(`give_promissory_to_opponent: transfer failed: ${transferError.message}`)
      break
    }

    case 'increase_move': {
      // Validate ship_id is present
      if (!context.selections?.ship_id) throw dslError('increase_move: ship_id is required', 400)
      // Set move override flag for caller to compute actual max move
      ;(context as Record<string, unknown>).move_override = {
        ship_id: context.selections?.ship_id,
        move: 'MAX',
      }
      break
    }

    case 'produce_at_any_space_dock': {
      // Set dock planet override for caller to handle
      const dockPlanet = context.selections?.dock_planet as string
      if (!dockPlanet) throw dslError('dock_planet is required', 400)
      ;(context as Record<string, unknown>).dock_planet_override = dockPlanet
      break
    }

    default:
      throw new Error(`Unknown op: ${op.op}`)
  }
}

function resolveAmount(amount: number | string, context: ResolveContext): number {
  if (amount === 'chosen_amount') return context.chosenAmount ?? 0
  return amount as number
}

/**
 * Alias for interpretEffects — convenience wrapper used by relic/exploration handlers
 * that pass a self-contained op array without needing a full ResolveContext.
 */
export async function applyAbility(
  effects: unknown[],
  context: ResolveContext,
  db: SupabaseClient
): Promise<void> {
  return interpretEffects(effects, context, db)
}
