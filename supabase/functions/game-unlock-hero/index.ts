import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; leader_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.leader_id || typeof body.leader_id !== 'string') return errorResponse("'leader_id' is required")

  const { data: player } = await db
    .from('game_players')
    .select('id, leaders')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const p = player as Record<string, unknown>
  const leaders = (p.leaders ?? {}) as Record<string, string>

  const { data: leader } = await db
    .from('leaders')
    .select('id, leader_type')
    .eq('id', body.leader_id)
    .maybeSingle()
  if (!leader) return errorResponse('Leader not found', 404)

  const l = leader as Record<string, string>
  if (l.leader_type !== 'hero') return errorResponse('Leader is not a hero', 400)
  if (leaders.hero === 'unlocked') return errorResponse('Hero already unlocked', 409)
  if (leaders.hero === 'purged') return errorResponse('Hero already purged', 409)

  // Count scored public objectives
  const { data: pubObjectives } = await db
    .from('game_public_objectives')
    .select('id')
    .eq('game_id', body.game_id)
    .contains('scored_by', [p.id as string])

  const pubCount = (pubObjectives ?? []).length

  // Count scored secret objectives
  const { data: secObjectives } = await db
    .from('game_player_secret_objectives')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('player_id', p.id as string)
    .eq('state', 'scored')

  const secCount = (secObjectives ?? []).length

  if (pubCount + secCount < 3) {
    return errorResponse('Unlock condition not met: need 3 scored objectives', 409)
  }

  await db
    .from('game_players')
    .update({ leaders: { ...leaders, hero: 'unlocked' } })
    .eq('id', p.id as string)

  return okResponse({ unlocked: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
