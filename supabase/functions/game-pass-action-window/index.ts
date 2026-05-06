import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type WindowPasses = { attacker: boolean; defender: boolean }
type CombatRow = Record<string, unknown>

async function advanceFromWindow(combat: CombatRow, gameId: string): Promise<void> {
  const phase = combat.phase as string
  const pendingEffects = (combat.pending_effects ?? {}) as Record<string, unknown>

  const resetPasses: WindowPasses = { attacker: false, defender: false }

  let nextPhase: string
  const extraUpdates: Record<string, unknown> = {}

  switch (phase) {
    case 'window_pre_space_cannon':
      nextPhase = 'space_cannon'
      break
    case 'window_space_cannon_assign': {
      // Apply pending space cannon hits
      const attackerPendingHits = (pendingEffects['attacker_space_cannon_hits'] as number | undefined) ?? 0
      const defenderPendingHits = (pendingEffects['defender_space_cannon_hits'] as number | undefined) ?? 0
      if (attackerPendingHits !== 0) {
        extraUpdates['attacker_hits'] = ((combat.attacker_hits as number | undefined) ?? 0) + attackerPendingHits
      }
      if (defenderPendingHits !== 0) {
        extraUpdates['defender_hits'] = ((combat.defender_hits as number | undefined) ?? 0) + defenderPendingHits
      }
      nextPhase = 'window_pre_barrage'
      break
    }
    case 'window_pre_barrage':
      nextPhase = 'barrage'
      break
    case 'window_start_round':
      nextPhase = 'window_announce_retreat'
      break
    case 'window_announce_retreat':
      // Check for rout_active: if active and attacker can retreat, force retreat
      // For now: advance to attacker_roll (retreat handling is separate)
      nextPhase = 'attacker_roll'
      break
    case 'window_pre_assign_defender':
      nextPhase = 'defender_assign'
      break
    case 'window_post_sustain': {
      extraUpdates['sustained_this_phase'] = []
      const destroyed = (combat.destroyed_this_phase ?? []) as unknown[]
      if (destroyed.length > 0) {
        nextPhase = 'window_post_destroy'
      } else {
        nextPhase = 'attacker_roll'
      }
      break
    }
    case 'window_post_destroy':
      extraUpdates['destroyed_this_phase'] = []
      nextPhase = 'attacker_roll'
      break
    case 'window_pre_assign_attacker':
      nextPhase = 'attacker_assign'
      break
    case 'window_post_combat':
      nextPhase = 'dismissed'
      break
    default:
      nextPhase = 'attacker_roll'
  }

  await db
    .from('game_combats')
    .update({
      phase: nextPhase,
      window_passes: resetPasses,
      ...extraUpdates,
    })
    .eq('id', combat.id)
    .eq('game_id', gameId)
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try { userId = await requireAuth(req) } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_code?: unknown; combat_id?: unknown; game_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_code && !body.game_id) return errorResponse("'game_code' or 'game_id' is required")

  // Resolve game
  let gameId: string
  if (body.game_id && typeof body.game_id === 'string') {
    gameId = body.game_id
  } else {
    const { data: game } = await db
      .from('games')
      .select('id')
      .eq('code', body.game_code)
      .maybeSingle()
    if (!game) return errorResponse('Game not found', 404)
    gameId = (game as Record<string, string>).id
  }

  // Fetch player
  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  // Phase 29b: game-level window path (no combat_id)
  if (!body.combat_id) {
    const { data: gameRow } = await db
      .from('games')
      .select('pending_action_window')
      .eq('id', gameId)
      .maybeSingle()
    if (!gameRow) return errorResponse('Game not found', 404)

    type ActionWindow = { type: string; eligible_player_ids: string[]; passed_player_ids: string[]; context: Record<string, unknown> }
    const window = (gameRow as Record<string, unknown>).pending_action_window as ActionWindow | null
    if (!window) return errorResponse('No active window', 409)

    const playerId = (player as Record<string, string>).id
    if (!window.eligible_player_ids.includes(playerId)) return errorResponse('Not eligible for this window', 409)
    if (window.passed_player_ids.includes(playerId)) return errorResponse('Already passed', 409)

    const updatedPassed = [...window.passed_player_ids, playerId]
    if (updatedPassed.length === window.eligible_player_ids.length) {
      await db.from('games').update({ pending_action_window: null }).eq('id', gameId)
    } else {
      await db.from('games').update({ pending_action_window: { ...window, passed_player_ids: updatedPassed } }).eq('id', gameId)
    }

    return okResponse({})
  }

  // Phase 20: combat window path
  const { data: combat } = await db
    .from('game_combats')
    .select('*')
    .eq('id', body.combat_id)
    .eq('game_id', gameId)
    .maybeSingle()
  if (!combat) return errorResponse('Combat not found', 404)

  if (!(combat.phase as string).startsWith('window_')) {
    return errorResponse('Not in an action window', 409)
  }

  const side: 'attacker' | 'defender' =
    (player as Record<string, string>).id === (combat as CombatRow).attacker_player_id ? 'attacker' : 'defender'

  const passes: WindowPasses = {
    attacker: ((combat.window_passes as WindowPasses | null)?.attacker) ?? false,
    defender: ((combat.window_passes as WindowPasses | null)?.defender) ?? false,
  }
  passes[side] = true

  await db
    .from('game_combats')
    .update({ window_passes: passes })
    .eq('id', body.combat_id)
    .eq('game_id', gameId)

  if (passes.attacker && passes.defender) {
    await advanceFromWindow(combat as CombatRow, gameId)
    // Read updated phase after advance
    const { data: updated } = await db
      .from('game_combats')
      .select('phase')
      .eq('id', body.combat_id)
      .maybeSingle()
    return okResponse({ phase: (updated as Record<string, string> | null)?.phase ?? combat.phase })
  }

  return okResponse({ phase: combat.phase })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
