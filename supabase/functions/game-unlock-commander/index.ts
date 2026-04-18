import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; ability_definition_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.ability_definition_id || typeof body.ability_definition_id !== 'string') return errorResponse("'ability_definition_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, vp, technologies, leaders, faction')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: ability, error: abilityError } = await db
    .from('ability_definitions')
    .select('unlock_conditions')
    .eq('id', body.ability_definition_id)
    .maybeSingle()
  if (abilityError) return errorResponse('Database error', 500)
  if (!ability) return errorResponse('Ability not found', 404)

  const p = player as Record<string, unknown>
  const conditions = ((ability as Record<string, unknown>).unlock_conditions as Record<string, unknown>[]) ?? []

  for (const condition of conditions) {
    const met = await evaluateCondition(condition, p, body.game_id, db)
    if (!met) return errorResponse('Unlock conditions not met', 409)
  }

  const { data: source, error: sourceError } = await db
    .from('ability_sources')
    .select('source_id')
    .eq('ability_id', body.ability_definition_id)
    .eq('source_type', 'leader')
    .maybeSingle()
  if (sourceError) return errorResponse('Database error', 500)
  if (!source) return errorResponse('Leader source not found', 404)

  const { data: leader, error: leaderError } = await db
    .from('leaders')
    .select('leader_type')
    .eq('id', (source as Record<string, string>).source_id)
    .maybeSingle()
  if (leaderError) return errorResponse('Database error', 500)
  if (!leader || (leader as Record<string, string>).leader_type !== 'commander') {
    return errorResponse('Ability source is not a commander', 400)
  }

  const currentLeaders = (p.leaders as Record<string, string>) ?? {}
  const { error: updateError } = await db
    .from('game_players')
    .update({ leaders: { ...currentLeaders, commander: 'unlocked' } })
    .eq('id', p.id as string)
  if (updateError) return errorResponse('Database error', 500)

  return okResponse({ unlocked: true })
}

async function evaluateCondition(
  condition: Record<string, unknown>,
  player: Record<string, unknown>,
  gameId: string,
  db: SupabaseClient
): Promise<boolean> {
  switch (condition.check) {
    case 'scored_objectives': {
      const { data: pubObjs } = await db
        .from('game_public_objectives')
        .select('scored_by')
        .eq('game_id', gameId)
      const pubCount = (pubObjs ?? []).filter(
        (o: Record<string, string[]>) => o.scored_by?.includes(player.id as string)
      ).length
      const { data: secObjs } = await db
        .from('game_player_secret_objectives')
        .select('id')
        .eq('game_id', gameId)
        .eq('player_id', player.id as string)
        .eq('state', 'scored')
      const secCount = (secObjs ?? []).length
      return (pubCount + secCount) >= (condition.gte as number)
    }
    case 'tech_count': {
      const count = ((player.technologies as string[]) ?? []).length
      return count >= (condition.gte as number)
    }
    case 'vp_count': {
      return (player.vp as number) >= (condition.gte as number)
    }
    default:
      return false
  }
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
