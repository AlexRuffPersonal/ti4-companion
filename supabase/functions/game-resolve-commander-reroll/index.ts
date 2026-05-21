import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type DieResult = { roll: number; hit_on: number; hit: boolean; rerolled?: boolean }

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; combat_id?: unknown; reroll_indices?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")
  if (!Array.isArray(body.reroll_indices)) return errorResponse("'reroll_indices' is required")

  const { data: player } = await db
    .from('game_players')
    .select('id, leaders, faction')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const p = player as Record<string, unknown>
  const leaders = (p.leaders ?? {}) as Record<string, string>

  if (leaders.commander !== 'unlocked') return errorResponse('Commander not unlocked', 409)
  if ((p.faction as string) !== 'The Universities Of Jol-Nar') return errorResponse('Only Jol-Nar can use this endpoint', 400)

  const { data: combat } = await db
    .from('game_combats')
    .select('id, attacker_player_id, defender_player_id, attacker_dice, defender_dice, attacker_hits, defender_hits')
    .eq('id', body.combat_id)
    .eq('game_id', body.game_id)
    .maybeSingle()
  if (!combat) return errorResponse('Combat not found', 404)

  const c = combat as Record<string, unknown>
  const rerollIndices = body.reroll_indices as number[]

  if (rerollIndices.length === 0) return errorResponse('No dice to reroll', 400)

  const side = c.attacker_player_id === p.id ? 'attacker' : 'defender'
  const diceCol = side === 'attacker' ? 'attacker_dice' : 'defender_dice'
  const hitsCol = side === 'attacker' ? 'attacker_hits' : 'defender_hits'
  const currentDice = (c[diceCol] as DieResult[]) ?? []

  if (rerollIndices.some((i) => i >= currentDice.length)) {
    return errorResponse('Invalid reroll indices', 400)
  }

  // Reroll chosen dice
  const newDice: DieResult[] = currentDice.map((die, i) => {
    if (rerollIndices.includes(i)) {
      const roll = Math.floor(Math.random() * 10) + 1
      return { ...die, roll, rerolled: true, hit: roll >= die.hit_on }
    }
    return die
  })

  const newHits = newDice.filter((d) => d.hit).length

  await db
    .from('game_combats')
    .update({ [diceCol]: newDice, [hitsCol]: newHits })
    .eq('id', c.id as string)

  return okResponse({ dice: newDice, hits: newHits })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
