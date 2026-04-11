import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const VALID_COLOURS = new Set(['red', 'blue', 'yellow', 'green', 'purple', 'black', 'orange', 'pink'])

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; faction?: unknown; colour?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.faction || typeof body.faction !== 'string') return errorResponse("'faction' is required")
  if (!body.colour || typeof body.colour !== 'string') return errorResponse("'colour' is required")
  if (!VALID_COLOURS.has(body.colour)) {
    return errorResponse(`'colour' must be one of: ${[...VALID_COLOURS].join(', ')}`)
  }

  // Verify caller is in the game
  const { data: myPlayer, error: myError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (myError) return errorResponse('Database error', 500)
  if (!myPlayer) return errorResponse('You are not in this game', 403)

  // Check faction not taken by another player
  const { data: factionTaken } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('faction', body.faction)
    .neq('user_id', userId)
    .maybeSingle()
  if (factionTaken) return errorResponse('Faction already taken by another player', 409)

  // Check colour not taken by another player
  const { data: colourTaken } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('colour', body.colour)
    .neq('user_id', userId)
    .maybeSingle()
  if (colourTaken) return errorResponse('Colour already taken by another player', 409)

  const { error: updateError } = await db
    .from('game_players')
    .update({ faction: body.faction, colour: body.colour })
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ updated: true })
})
