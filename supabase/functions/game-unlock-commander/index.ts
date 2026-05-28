import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { checkCommanderUnlock } from '../_shared/commanderUnlock.ts'

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
    .select('id, leaders, technologies, trade_goods, action_card_count, commander_flags, faction')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const p = player as Record<string, unknown>

  const { data: leader } = await db
    .from('leaders')
    .select('id, faction, leader_type')
    .eq('id', body.leader_id)
    .maybeSingle()
  if (!leader) return errorResponse('Leader not found', 404)

  const l = leader as Record<string, string>
  if (l.leader_type !== 'commander') return errorResponse('Leader is not a commander', 400)

  const currentLeaders = (p.leaders as Record<string, string>) ?? {}
  if (currentLeaders.commander === 'unlocked') return errorResponse('Commander already unlocked', 409)

  const met = await checkCommanderUnlock(l.faction, body.game_id, p, db)
  if (!met) return errorResponse('Unlock condition not met', 409)

  await db
    .from('game_players')
    .update({ leaders: { ...currentLeaders, commander: 'unlocked' } })
    .eq('id', p.id as string)

  return okResponse({ unlocked: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
