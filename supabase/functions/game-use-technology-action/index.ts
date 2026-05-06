import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { EXHAUSTABLE_TECHS } from '../_shared/techEffects.ts'

type Selections = Record<string, unknown>

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; technology_name?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.technology_name || typeof body.technology_name !== 'string') return errorResponse("'technology_name' is required")

  const selections = (body.selections ?? {}) as Selections

  const { data: player } = await db
    .from('game_players')
    .select('id, technologies, exhausted_technologies, trade_goods, command_tokens, action_card_count')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const technologies = (player.technologies ?? []) as string[]
  const exhaustedTechs = (player.exhausted_technologies ?? []) as string[]
  const tech = body.technology_name

  if (!technologies.includes(tech)) return errorResponse('Technology not owned', 409)

  const isExhaustable = EXHAUSTABLE_TECHS.has(tech)
  const isExhausted = exhaustedTechs.includes(tech)

  async function exhaustTech() {
    await db.from('game_players')
      .update({ exhausted_technologies: [...exhaustedTechs, tech] })
      .eq('id', player.id)
  }

  switch (tech) {
    case 'X-89 Bacterial Weapon': {
      if (isExhausted) return errorResponse('Technology already exhausted', 409)
      const planetName = selections.planet_name as string | undefined
      if (!planetName) return errorResponse("'planet_name' is required")
      await db.from('game_player_units')
        .delete()
        .eq('game_id', body.game_id)
        .eq('on_planet', planetName)
        .eq('unit_type', 'infantry')
      await exhaustTech()
      break
    }

    case 'Production Biomes': {
      if (isExhausted) return errorResponse('Technology already exhausted', 409)
      const chosenPlayerId = selections.chosen_player_id as string | undefined
      if (!chosenPlayerId) return errorResponse("'chosen_player_id' is required")
      const tokens = (player.command_tokens ?? {}) as Record<string, number>
      if ((tokens.strategy ?? 0) < 1) return errorResponse('Insufficient strategy tokens', 409)
      await db.from('game_players').update({ trade_goods: (player.trade_goods ?? 0) + 4 }).eq('id', player.id)
      const { data: chosen } = await db.from('game_players').select('id, trade_goods').eq('id', chosenPlayerId).maybeSingle()
      if (chosen) {
        await db.from('game_players').update({ trade_goods: (chosen.trade_goods ?? 0) + 2 }).eq('id', chosenPlayerId)
      }
      await db.from('game_players').update({ command_tokens: { ...tokens, strategy: tokens.strategy - 1 } }).eq('id', player.id)
      await exhaustTech()
      break
    }

    case 'Sling Relay': {
      if (isExhausted) return errorResponse('Technology already exhausted', 409)
      const systemKey = selections.system_key as string | undefined
      const unitType = selections.unit_type as string | undefined
      if (!systemKey) return errorResponse("'system_key' is required")
      if (!unitType) return errorResponse("'unit_type' is required")
      const { data: existing } = await db.from('game_player_units')
        .select('id, count')
        .eq('game_id', body.game_id)
        .eq('player_id', player.id)
        .eq('system_key', systemKey)
        .eq('unit_type', unitType)
        .is('on_planet', null)
        .maybeSingle()
      if (existing) {
        await db.from('game_player_units').update({ count: (existing.count ?? 1) + 1 }).eq('id', existing.id)
      } else {
        await db.from('game_player_units').insert({
          game_id: body.game_id, player_id: player.id, system_key: systemKey,
          unit_type: unitType, on_planet: null, count: 1,
        })
      }
      await exhaustTech()
      break
    }

    case 'Vortex': {
      if (isExhausted) return errorResponse('Technology already exhausted', 409)
      const systemKey = selections.system_key as string | undefined
      const unitType = selections.unit_type as string | undefined
      if (!systemKey || !unitType) return errorResponse("'system_key' and 'unit_type' are required")
      const { data: existing } = await db.from('game_player_units')
        .select('id, count')
        .eq('game_id', body.game_id)
        .eq('player_id', player.id)
        .eq('system_key', systemKey)
        .eq('unit_type', unitType)
        .is('on_planet', null)
        .maybeSingle()
      if (existing) {
        await db.from('game_player_units').update({ count: (existing.count ?? 1) + 1 }).eq('id', existing.id)
      } else {
        await db.from('game_player_units').insert({
          game_id: body.game_id, player_id: player.id, system_key: systemKey,
          unit_type: unitType, on_planet: null, count: 1,
        })
      }
      await exhaustTech()
      break
    }

    case 'Mageon Implants': {
      if (isExhausted) return errorResponse('Technology already exhausted', 409)
      const cardId = selections.card_id as string | undefined
      const targetPlayerId = selections.target_player_id as string | undefined
      if (!cardId || !targetPlayerId) return errorResponse("'card_id' and 'target_player_id' are required")
      await db.from('game_action_card_deck').update({ held_by_player_id: player.id }).eq('id', cardId)
      const { data: target } = await db.from('game_players').select('id, action_card_count').eq('id', targetPlayerId).maybeSingle()
      if (target) {
        await db.from('game_players').update({ action_card_count: Math.max(0, (target.action_card_count ?? 0) - 1) }).eq('id', targetPlayerId)
      }
      await db.from('game_players').update({ action_card_count: (player.action_card_count ?? 0) + 1 }).eq('id', player.id)
      await exhaustTech()
      break
    }

    case 'Lazax Gate Folding': {
      if (isExhausted) return errorResponse('Technology already exhausted', 409)
      const { data: existing } = await db.from('game_player_units')
        .select('id, count')
        .eq('game_id', body.game_id)
        .eq('player_id', player.id)
        .eq('system_key', '0,0')
        .eq('unit_type', 'infantry')
        .eq('on_planet', 'Mecatol Rex')
        .maybeSingle()
      if (existing) {
        await db.from('game_player_units').update({ count: (existing.count ?? 1) + 1 }).eq('id', existing.id)
      } else {
        await db.from('game_player_units').insert({
          game_id: body.game_id, player_id: player.id, system_key: '0,0',
          unit_type: 'infantry', on_planet: 'Mecatol Rex', count: 1,
        })
      }
      await exhaustTech()
      break
    }

    case 'Transit Diodes': {
      if (isExhausted) return errorResponse('Technology already exhausted', 409)
      const unitMoves = selections.unit_moves as Array<{ unit_id: string; to_planet: string }> | undefined
      if (!unitMoves || !Array.isArray(unitMoves)) return errorResponse("'unit_moves' is required")
      if (unitMoves.length > 4) return errorResponse('Cannot move more than 4 units', 409)
      for (const move of unitMoves) {
        await db.from('game_player_units').update({ on_planet: move.to_planet }).eq('id', move.unit_id)
      }
      await exhaustTech()
      break
    }

    case 'Chaos Mapping': {
      // Not exhaustable — no check needed
      const systemKey = selections.system_key as string | undefined
      const unitType = selections.unit_type as string | undefined
      if (!systemKey || !unitType) return errorResponse("'system_key' and 'unit_type' are required")
      const { data: existing } = await db.from('game_player_units')
        .select('id, count')
        .eq('game_id', body.game_id)
        .eq('player_id', player.id)
        .eq('system_key', systemKey)
        .eq('unit_type', unitType)
        .is('on_planet', null)
        .maybeSingle()
      if (existing) {
        await db.from('game_player_units').update({ count: (existing.count ?? 1) + 1 }).eq('id', existing.id)
      } else {
        await db.from('game_player_units').insert({
          game_id: body.game_id, player_id: player.id, system_key: systemKey,
          unit_type: unitType, on_planet: null, count: 1,
        })
      }
      break
    }

    default:
      return errorResponse('Unknown technology action', 400)
  }

  void isExhaustable
  return okResponse({})
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
