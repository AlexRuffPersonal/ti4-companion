import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_SCORE_OBJECTIVE } from '../_shared/gameEvents.ts'
import { buildEvaluationContext, evaluateCondition, applySpendSideEffect } from '../_shared/objectiveConditions.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; objective_id?: unknown; player_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.objective_id || typeof body.objective_id !== 'string') return errorResponse("'objective_id' is required")
  if (!body.player_id || typeof body.player_id !== 'string') return errorResponse("'player_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can score objectives', 403)

  // objective_id is the game_public_objectives row id
  const { data: gameObj, error: objError } = await db
    .from('game_public_objectives')
    .select('id, objective_id, state, scored_by')
    .eq('id', body.objective_id)
    .eq('game_id', body.game_id)
    .maybeSingle()
  if (objError) return errorResponse('Database error', 500)
  if (!gameObj) return errorResponse('Objective not found in this game', 404)
  if (gameObj.state !== 'revealed') return errorResponse('Objective has not been revealed yet', 409)
  if ((gameObj.scored_by ?? []).includes(body.player_id)) {
    return errorResponse('Player has already scored this objective', 409)
  }

  // Get player row for home system check
  const { data: player_data, error: playerDataError } = await db
    .from('game_players')
    .select('id, faction')
    .eq('id', body.player_id)
    .eq('game_id', body.game_id)
    .maybeSingle()
  if (playerDataError) return errorResponse('Database error', 500)
  if (!player_data) return errorResponse('Player not found in this game', 404)

  // Get game map_tiles to find home system
  const { data: gameMapData } = await db.from('games').select('map_tiles').eq('id', body.game_id).maybeSingle()
  const mapTiles = gameMapData?.map_tiles ?? {}

  // Find home system key for this player's faction
  const { data: factionTile } = await db.from('tiles').select('id, faction_key').eq('faction_key', player_data.faction).maybeSingle()

  if (factionTile) {
    // Find the system_key in map_tiles where tileId === factionTile.id
    const homeSystemKey = Object.entries(mapTiles as Record<string, number>).find(([, tileId]) => tileId === factionTile.id)?.[0]
    if (homeSystemKey) {
      // Get all planets in game_player_planets for this player
      const { data: playerPlanets } = await db.from('game_player_planets').select('tile_id').eq('player_id', body.player_id)
      const controlledTileIds = new Set((playerPlanets ?? []).map((p: { tile_id: string }) => p.tile_id))

      // Get planets in home system tile
      const homeSystemTileId = mapTiles[homeSystemKey]
      const { data: homeSystemTile } = await db.from('tiles').select('planets').eq('id', homeSystemTileId).maybeSingle()
      const homePlanets = (homeSystemTile?.planets as { name: string }[]) ?? []

      if (homePlanets.length > 0 && !controlledTileIds.has(String(homeSystemTileId))) {
        return errorResponse('Must control your home system to score public objectives', 422)
      }
    }
  }

  // Get point value and condition_check from reference table
  const { data: refObj, error: refError } = await db
    .from('public_objectives')
    .select('points, condition_check')
    .eq('id', gameObj.objective_id)
    .single()
  if (refError) return errorResponse('Database error', 500)
  const points = refObj?.points ?? 1

  // Evaluate condition if present
  const refConditionCheck = refObj?.condition_check ?? null
  let conditionCtx = null
  if (refConditionCheck) {
    conditionCtx = await buildEvaluationContext(db, body.game_id, body.player_id)
    const result = evaluateCondition(refConditionCheck, conditionCtx)
    if (!result.eligible) return errorResponse(result.reason || 'Objective condition not met', 422)
  }

  // Append player to scored_by
  const { error: updateObjError } = await db
    .from('game_public_objectives')
    .update({ scored_by: [...(gameObj.scored_by ?? []), body.player_id] })
    .eq('id', body.objective_id)
  if (updateObjError) return errorResponse(`Update failed: ${updateObjError.message}`, 500)

  // Increment VP
  const { data: player, error: playerFetchError } = await db
    .from('game_players')
    .select('vp')
    .eq('id', body.player_id)
    .eq('game_id', body.game_id)
    .maybeSingle()
  if (playerFetchError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { error: vpError } = await db
    .from('game_players')
    .update({ vp: player.vp + points })
    .eq('id', body.player_id)
  if (vpError) return errorResponse(`VP update failed: ${vpError.message}`, 500)

  // Apply spend side effects after VP update
  if (refConditionCheck) {
    const spendTypes = ['spend_resources', 'spend_influence', 'spend_trade_goods', 'spend_command_tokens']
    if (spendTypes.includes(refConditionCheck.type)) {
      const ctx = conditionCtx ?? await buildEvaluationContext(db, body.game_id, body.player_id)
      await applySpendSideEffect(refConditionCheck.type, refConditionCheck.params ?? {}, ctx, db)
    }
  }

  await logEvent(db, {
    game_id: body.game_id,
    player_id: body.player_id,
    event_type: EVT_SCORE_OBJECTIVE,
    payload: { player_id: body.player_id, objective_id: body.objective_id, vp_before: player.vp, vp_after: player.vp + points },
    round: 0,
    phase: 'status',
  })
  return okResponse({ scored: true, vp_awarded: points })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
