import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { code?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.code || typeof body.code !== 'string') {
    return errorResponse("'code' must be a non-empty string")
  }

  const code = body.code.toUpperCase().trim()

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, status')
    .eq('code', code)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.status !== 'lobby') return errorResponse('Game has already started or ended', 409)

  // Idempotent: if caller already has a row, succeed immediately
  const { data: existing } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', game.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (existing) return okResponse({ game_id: game.id, code })

  // Check capacity
  const { count, error: countError } = await db
    .from('game_players')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', game.id)
  if (countError) return errorResponse('Database error', 500)
  if ((count ?? 0) >= 8) return errorResponse('Game is full (maximum 8 players)', 409)

  const { data: profile } = await db
    .from('profiles')
    .select('display_name')
    .eq('user_id', userId)
    .single()

  const { error: insertError } = await db
    .from('game_players')
    .insert({
      game_id: game.id,
      user_id: userId,
      display_name: profile?.display_name ?? 'Unknown',
      seat_index: count ?? 0,
      vp: 0,
      command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 },
      commodities: 0,
      trade_goods: 0,
    })
  if (insertError) return errorResponse(`Failed to join game: ${insertError.message}`, 500)

  return okResponse({ game_id: game.id, code })
})
