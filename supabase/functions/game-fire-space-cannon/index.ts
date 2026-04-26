import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type SpEntry = { player_id: string; system_key: string; unit_type: string; dice_count: number; resolved: boolean }
type UnitRow = { id: string; player_id: string; unit_type: string; count: number; system_key: string }

function parseCombatValue(text: string): number {
  const m = text.match(/^(\d+)/)
  return m ? parseInt(m[1]) : 6
}

async function applyHits(gameId: string, systemKey: string, targetPlayerId: string, hits: number): Promise<void> {
  if (hits <= 0) return
  const { data: units } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count, system_key')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', targetPlayerId)
    .is('on_planet', null)

  const sorted = [...(units ?? []) as UnitRow[]].sort((a, b) => {
    if (a.unit_type === 'fighter' && b.unit_type !== 'fighter') return -1
    if (a.unit_type !== 'fighter' && b.unit_type === 'fighter') return 1
    return 0
  })

  let remaining = hits
  for (const unit of sorted) {
    if (remaining <= 0) break
    const remove = Math.min(remaining, unit.count)
    if (unit.count - remove === 0) {
      await db.from('game_player_units').delete().eq('id', unit.id)
    } else {
      await db.from('game_player_units').update({ count: unit.count - remove }).eq('id', unit.id)
    }
    remaining -= remove
  }
}

async function hasDestroyer(gameId: string, systemKey: string, playerId: string): Promise<boolean> {
  const { data } = await db
    .from('game_player_units')
    .select('id, unit_type')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .is('on_planet', null)
  return (data ?? []).some((u: { unit_type: string }) => u.unit_type === 'destroyer')
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; combat_id?: unknown; pass?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")
  if (typeof body.pass !== 'boolean') return errorResponse("'pass' must be a boolean")

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: combat } = await db
    .from('game_combats')
    .select('*')
    .eq('id', body.combat_id)
    .eq('game_id', body.game_id)
    .maybeSingle()
  if (!combat) return errorResponse('Combat not found', 404)
  if (combat.phase !== 'space_cannon') return errorResponse('Combat is not in space_cannon phase', 409)

  const pending = (combat.space_cannon_pending ?? []) as SpEntry[]
  const myEntry = pending.find((e) => e.player_id === player.id && !e.resolved)
  if (!myEntry) return errorResponse('No unresolved space cannon opportunity for this player', 409)

  if (!body.pass) {
    const { data: unitDef } = await db
      .from('units')
      .select('space_cannon')
      .eq('name', myEntry.unit_type)
      .maybeSingle()
    const scValue = parseCombatValue(unitDef?.space_cannon ?? '6')

    let hits = 0
    for (let i = 0; i < myEntry.dice_count; i++) {
      if (Math.floor(Math.random() * 10) + 1 >= scValue) hits++
    }

    const targetId = player.id === combat.attacker_player_id
      ? combat.defender_player_id
      : combat.attacker_player_id

    await applyHits(body.game_id, combat.system_key, targetId, hits)
  }

  const updatedPending = pending.map((e) =>
    e.player_id === player.id && !e.resolved ? { ...e, resolved: true } : e
  )

  const allResolved = updatedPending.every((e) => e.resolved)
  let newPhase = combat.phase as string
  if (allResolved) {
    const atkHasDestroyer = await hasDestroyer(body.game_id, combat.system_key, combat.attacker_player_id)
    const defHasDestroyer = await hasDestroyer(body.game_id, combat.system_key, combat.defender_player_id)
    newPhase = (atkHasDestroyer || defHasDestroyer) ? 'barrage' : 'attacker_roll'
  }

  const { error: updateError } = await db
    .from('game_combats')
    .update({ space_cannon_pending: updatedPending, phase: newPhase })
    .eq('id', body.combat_id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ phase: newPhase })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
