import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ResolveContext {
  gameId: string
  activatingPlayerId: string
  targetPlayerId?: string
  targetPlanetName?: string
  chosenAmount?: number
  chosenOption?: number
}

type PlayerRow = Record<string, unknown>

export async function interpretEffects(
  effects: unknown[],
  context: ResolveContext,
  db: SupabaseClient
): Promise<void> {
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, trade_goods, commodities, vp, technologies, action_card_count')
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
    // These ops are defined in the DSL spec but not yet executable — they depend on
    // game systems (combat, voting, exploration) that will be built in future phases.
    case 'modify_roll':
    case 'add_die':
    case 'cancel_hit':
    case 'cast_votes':
    case 'prevent_vote':
    case 'draw_secret_objective':
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
