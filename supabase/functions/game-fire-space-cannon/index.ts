import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_FIRE_SPACE_CANNON } from '../_shared/gameEvents.ts'

type SpEntry = { player_id: string; system_key: string; unit_type: string; dice_count: number; resolved: boolean }
type UnitRow = { id: string; player_id: string; unit_type: string; count: number; system_key: string }

function parseCombatValue(text: string): number {
  const m = text.match(/^(\d+)/)
  return m ? parseInt(m[1]) : 6
}

async function hasDestroyer(gameId: string, systemKey: string, playerId: string): Promise<boolean> {
  const { data: units } = await db
    .from('game_player_units')
    .select('unit_type')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', playerId)
    .is('on_planet', null)
  return (units ?? []).some((u: { unit_type: string }) => u.unit_type === 'destroyer')
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

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; combat_id?: unknown; pass?: unknown; selections?: unknown; is_invasion?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.combat_id || typeof body.combat_id !== 'string') return errorResponse("'combat_id' is required")
  if (typeof body.pass !== 'boolean') return errorResponse("'pass' must be a boolean")

  const selections = (body.selections ?? {}) as Record<string, unknown>
  const isInvasion = body.is_invasion === true

  const { data: player } = await db
    .from('game_players')
    .select('id, technologies, exhausted_technologies')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const technologies: string[] = (player.technologies ?? []) as string[]
  const exhaustedTechs: string[] = (player.exhausted_technologies ?? []) as string[]

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

  // Determine target player
  const targetId = player.id === combat.attacker_player_id
    ? combat.defender_player_id
    : combat.attacker_player_id

  // Load target player technologies
  const { data: targetPlayer } = await db
    .from('game_players')
    .select('id, technologies')
    .eq('game_id', body.game_id)
    .eq('id', targetId)
    .maybeSingle()
  const targetTechs: string[] = ((targetPlayer?.technologies ?? []) as string[])

  // L4 Disruptors: cannot fire at Letnev units during invasion
  if (isInvasion && targetTechs.includes('L4 Disruptors')) {
    return errorResponse('Space Cannon cannot target Letnev units during invasion', 409)
  }

  if (!body.pass) {
    // Work on a copy of the entry to allow Plasma Scoring modification
    let diceCount = myEntry.dice_count

    // Plasma Scoring: +1 die
    if (technologies.includes('Plasma Scoring') && selections.use_plasma_scoring === true) {
      diceCount += 1
    }

    const { data: unitDef } = await db
      .from('units')
      .select('space_cannon')
      .eq('name', myEntry.unit_type)
      .maybeSingle()
    const scValue = parseCombatValue(unitDef?.space_cannon ?? '6')

    // Graviton Laser System: exhaust for non-fighter assignment constraint
    let gravitonActive = false
    if (technologies.includes('Graviton Laser System') && !exhaustedTechs.includes('Graviton Laser System') && selections.use_graviton === true) {
      gravitonActive = true
      const newExhausted = [...exhaustedTechs, 'Graviton Laser System']
      await db.from('game_players').update({ exhausted_technologies: newExhausted }).eq('id', player.id)
    }

    let hits = 0
    const diceResults: { roll: number; hit: boolean }[] = []
    for (let i = 0; i < diceCount; i++) {
      let roll = Math.floor(Math.random() * 10) + 1
      // Antimass Deflectors: -1 to each die result (min 1)
      if (targetTechs.includes('Antimass Deflectors')) {
        roll = Math.max(1, roll - 1)
      }
      const hit = roll >= scValue
      if (hit) hits++
      diceResults.push({ roll, hit })
    }

    await applyHits(body.game_id, combat.system_key, targetId, hits)

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

    await logEvent(db, {
      game_id: body.game_id,
      player_id: player.id,
      event_type: EVT_FIRE_SPACE_CANNON,
      payload: { player_id: player.id, system_key: combat.system_key, dice_results: diceResults, hits },
      round: 0,
      phase: 'action',
    })
    return okResponse({ phase: newPhase, dice: diceResults, hits, graviton_active: gravitonActive })
  }

  // Passing
  const updatedPending = pending.map((e) =>
    e.player_id === player.id && !e.resolved ? { ...e, resolved: true } : e
  )

  const allResolved = updatedPending.every((e) => e.resolved)
  let newPhase = combat.phase as string
  if (allResolved) {
    newPhase = 'barrage'
  }

  const { error: updateError } = await db
    .from('game_combats')
    .update({ space_cannon_pending: updatedPending, phase: newPhase })
    .eq('id', body.combat_id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ phase: newPhase })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
