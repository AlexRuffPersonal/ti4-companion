import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { EXHAUSTABLE_TECHS } from '../_shared/techEffects.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; technology_name?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.technology_name || typeof body.technology_name !== 'string') return errorResponse("'technology_name' is required")

  const { data: player } = await db
    .from('game_players')
    .select('id, technologies, exhausted_technologies')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const technologies = (player.technologies ?? []) as string[]
  const exhaustedTechs = (player.exhausted_technologies ?? []) as string[]

  if (!technologies.includes(body.technology_name)) return errorResponse('Technology not owned', 409)
  if (!EXHAUSTABLE_TECHS.has(body.technology_name)) return errorResponse('Technology cannot be exhausted', 409)
  if (exhaustedTechs.includes(body.technology_name)) return errorResponse('Technology already exhausted', 409)

  const { error } = await db
    .from('game_players')
    .update({ exhausted_technologies: [...exhaustedTechs, body.technology_name] })
    .eq('id', player.id)
  if (error) return errorResponse('Database error', 500)

  return okResponse({})
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
