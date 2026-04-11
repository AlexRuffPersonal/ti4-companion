import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  // Fetch host's display name
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('display_name')
    .eq('user_id', userId)
    .single()
  if (profileError) return errorResponse('Could not fetch profile', 500)

  // Generate a unique 6-char room code
  let code = ''
  let codeFound = false
  for (let attempt = 0; attempt < 6; attempt++) {
    code = generateCode()
    const { data: existing } = await db
      .from('games')
      .select('id')
      .eq('code', code)
      .maybeSingle()
    if (!existing) {
      codeFound = true
      break
    }
  }
  if (!codeFound) return errorResponse('Could not generate a unique room code', 500)

  // Insert the game
  const { data: game, error: gameError } = await db
    .from('games')
    .insert({
      code,
      host_user_id: userId,
      phase: 'strategy',
      round: 1,
      vp_goal: 10,
      permissions_mode: 'host',
      expansions: { base: true, pok: false, te: false },
      status: 'lobby',
    })
    .select('id, code')
    .single()
  if (gameError) return errorResponse(`Failed to create game: ${gameError.message}`, 500)

  // Add the host as the first player
  const { error: playerError } = await db
    .from('game_players')
    .insert({
      game_id: game.id,
      user_id: userId,
      display_name: profile?.display_name ?? 'Unknown',
      seat_index: 0,
      vp: 0,
      command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 },
      commodities: 0,
      trade_goods: 0,
    })
  if (playerError) return errorResponse(`Failed to add host player: ${playerError.message}`, 500)

  return okResponse({ code: game.code, game_id: game.id })
})
