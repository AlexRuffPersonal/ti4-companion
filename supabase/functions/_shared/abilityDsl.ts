import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ResolveContext {
  gameId: string
  activatingPlayerId: string
  targetPlayerId?: string
  targetPlanetName?: string
  chosenAmount?: number
  chosenOption?: number
  selections?: Record<string, unknown>
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
    // These ops are defined in the DSL spec but not yet executable — they depend on
    // game systems (combat, voting, exploration) that will be built in future phases.
    case 'modify_roll':
    case 'add_die':
    case 'cancel_hit':
    case 'cast_votes':
    case 'prevent_vote':
    case 'place_units':
    case 'destroy_units':
    case 'explore_planet':
    case 'convert_commodities':
    case 'gain_command_tokens':
    case 'ignore_prerequisite':
    case 'take_from_discard':
    case 'gain_technology':
      break  // No-op until the relevant game system is implemented
    default:
      throw new Error(`Unknown op: ${op.op}`)
  }
}

function resolveAmount(amount: number | string, context: ResolveContext): number {
  if (amount === 'chosen_amount') return context.chosenAmount ?? 0
  return amount as number
}
