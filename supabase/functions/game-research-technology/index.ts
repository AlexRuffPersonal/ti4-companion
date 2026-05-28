import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_RESEARCH_TECH } from '../_shared/gameEvents.ts'
import { applyCommanderPassives } from '../_shared/leaderEffects.ts'
import { getHandler } from '../_shared/abilityHandlers.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: {
    game_id?: unknown
    tech_name?: unknown
    exhaust_planet_ids?: unknown
    bypass_prerequisites?: unknown
    selections?: unknown
  }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.tech_name || typeof body.tech_name !== 'string') return errorResponse("'tech_name' is required")

  const exhaustPlanetIds: string[] = Array.isArray(body.exhaust_planet_ids)
    ? body.exhaust_planet_ids.filter((id: unknown) => typeof id === 'string')
    : []
  const bypassPrerequisites = body.bypass_prerequisites === true

  // Load game (for status + expansion filter)
  const { data: game, error: gameError } = await db
    .from('games')
    .select('status, expansions')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.status !== 'active') return errorResponse('Game is not active', 409)

  const activeExpansions = Object.entries(game.expansions ?? {})
    .filter(([, active]) => active)
    .map(([exp]) => exp)

  // Load tech reference data
  const { data: tech, error: techError } = await db
    .from('technologies')
    .select('name, technology_type, prerequisites, expansion')
    .eq('name', body.tech_name)
    .maybeSingle()
  if (techError) return errorResponse('Database error', 500)
  if (!tech) return errorResponse('Technology not found', 404)
  if (!activeExpansions.includes((tech.expansion as string) ?? 'base')) {
    return errorResponse('Technology is not available for this game', 400)
  }

  const selections = (body.selections ?? {}) as Record<string, unknown>

  // Load calling player
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, technologies, exhausted_technologies, trade_goods')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const heldTechs: string[] = (player.technologies as string[]) ?? []
  const exhaustedTechs: string[] = (player.exhausted_technologies as string[]) ?? []
  if (heldTechs.includes(body.tech_name)) return errorResponse('Technology already researched', 409)

  // Phase 30: AI Development Algorithm — exhaust to skip all prereqs for unit upgrades
  const isUnitUpgrade = (tech.technology_type as string) === 'unit_upgrade'
  const hasAIDA30 = heldTechs.includes('AI Development Algorithm') && !exhaustedTechs.includes('AI Development Algorithm')
  const useAiDevAlgo = selections.use_ai_dev_algo === true && isUnitUpgrade && hasAIDA30

  // Phase 30: Inheritance Systems — exhaust + spend 2 resources to skip all prereqs
  const hasInheritance = heldTechs.includes('Inheritance Systems') && !exhaustedTechs.includes('Inheritance Systems')
  const useInheritance = selections.use_inheritance === true && hasInheritance

  if (useInheritance) {
    const tradeGoods = (player.trade_goods as number) ?? 0
    // Load planet resources for Inheritance Systems cost check
    const { data: playerPlanets } = await db
      .from('game_player_planets')
      .select('resources, exhausted')
      .eq('game_id', body.game_id)
      .eq('player_id', player.id)
    const planetResources = ((playerPlanets ?? []) as Array<{ resources: number; exhausted: boolean }>)
      .filter(p => !p.exhausted)
      .reduce((sum, p) => sum + (p.resources ?? 0), 0)
    if (planetResources + tradeGoods < 2) return errorResponse('Insufficient resources', 409)
    // Spend 2 resources from TGs first
    const tgSpend = Math.min(tradeGoods, 2)
    if (tgSpend > 0) {
      await db.from('game_players').update({ trade_goods: tradeGoods - tgSpend }).eq('id', player.id)
    }
  }

  // Phase 43c: apply TECH_RESEARCHED commander passives before prerequisite check
  const techResearchContext: Record<string, unknown> = {
    gameId: body.game_id,
    activatingPlayerId: player.id,
    ignoreOnePrerequisite: false,
  }
  const { inlineEffects: techInlineEffects, pendingWindows: techPendingWindows } =
    await applyCommanderPassives('TECH_RESEARCHED', techResearchContext as never, db)
  for (const ie of techInlineEffects) {
    const effect = (ie as Record<string, unknown>).effect
    if (typeof effect === 'string') {
      try { await getHandler(effect)(techResearchContext as never, db) } catch { /* non-fatal */ }
    }
  }

  // Validate prerequisites (unless bypassed by flag, AIDA, or Inheritance Systems)
  const skipPrereqs = bypassPrerequisites || useAiDevAlgo || useInheritance
  if (!skipPrereqs) {
    const { data: allTechs, error: allTechsError } = await db
      .from('technologies')
      .select('name, technology_type')
    if (allTechsError) return errorResponse('Database error', 500)

    // Count held techs by colour family only (unit_upgrade does not satisfy colour prereqs)
    const heldCounts: Record<string, number> = { green: 0, blue: 0, yellow: 0, red: 0 }
    for (const name of heldTechs) {
      const t = (allTechs ?? []).find((t: { name: string; technology_type: string }) => t.name === name)
      if (t && t.technology_type !== 'unit_upgrade') {
        heldCounts[t.technology_type as string] = (heldCounts[t.technology_type as string] ?? 0) + 1
      }
    }

    const hasAIDA = heldTechs.includes('AI Development Algorithm')
    let aidaUsed = false

    let planetsToExhaust: Array<{ id: string; tech_specialty: string | null; exhausted: boolean; player_id: string }> = []
    if (exhaustPlanetIds.length > 0) {
      const { data: planets, error: planetsError } = await db
        .from('game_player_planets')
        .select('id, tech_specialty, exhausted, player_id')
        .in('id', exhaustPlanetIds)
      if (planetsError) return errorResponse('Database error', 500)
      planetsToExhaust = (planets ?? []) as typeof planetsToExhaust

      for (const planet of planetsToExhaust) {
        if (planet.player_id !== player.id) return errorResponse('Planet does not belong to this player', 403)
        if (planet.exhausted) return errorResponse('Planet is already exhausted', 400)
      }
    }

    const prereqs = (tech.prerequisites ?? {}) as Record<string, number>
    const remainingPlanets = [...planetsToExhaust]

    let yinOmarUsed = false
    for (const [colour, needed] of Object.entries(prereqs)) {
      const deficit = needed - (heldCounts[colour] ?? 0)
      if (deficit <= 0) continue

      let remaining = deficit

      // Yin Omar passive: ignore one prerequisite colour (applied once, to first deficit found)
      if (techResearchContext.ignoreOnePrerequisite && !yinOmarUsed) {
        yinOmarUsed = true
        remaining = Math.max(0, remaining - 1)
        if (remaining <= 0) continue
      }

      // Consume matching-specialty planets from the pool
      const used: number[] = []
      for (let i = 0; i < remainingPlanets.length && remaining > 0; i++) {
        if (remainingPlanets[i].tech_specialty === colour) {
          used.push(i)
          remaining--
        }
      }
      for (const i of used.reverse()) remainingPlanets.splice(i, 1)

      // Use AIDA for one remaining if available
      if (remaining > 0 && hasAIDA && !aidaUsed) {
        aidaUsed = true
        remaining--
      }

      if (remaining > 0) {
        return errorResponse(
          `Missing prerequisite: need ${needed} ${colour} technology, have ${heldCounts[colour] ?? 0}`,
          400
        )
      }
    }
  }

  // Write: append tech to player's technologies and handle exhaustion
  let newExhausted = [...exhaustedTechs]
  if (useAiDevAlgo) newExhausted = [...newExhausted, 'AI Development Algorithm']
  if (useInheritance) newExhausted = [...newExhausted, 'Inheritance Systems']

  const playerUpdate: Record<string, unknown> = { technologies: [...heldTechs, body.tech_name] }
  if (newExhausted.length !== exhaustedTechs.length) playerUpdate.exhausted_technologies = newExhausted

  const { error: updateError } = await db
    .from('game_players')
    .update(playerUpdate)
    .eq('id', player.id)
  if (updateError) return errorResponse(`Failed to research technology: ${updateError.message}`, 500)

  // Write: exhaust planets
  if (exhaustPlanetIds.length > 0) {
    const { error: exhaustError } = await db
      .from('game_player_planets')
      .update({ exhausted: true })
      .in('id', exhaustPlanetIds)
    if (exhaustError) return errorResponse(`Failed to exhaust planets: ${exhaustError.message}`, 500)
  }

  // Phase 29b: open after_technology_researched window for other players holding a matching card
  const { data: eligibleRows } = await db
    .from('game_action_card_deck')
    .select('held_by_player_id, action_cards!inner(timing, ability)')
    .eq('game_id', body.game_id)
    .eq('state', 'hand')
    .neq('held_by_player_id', (player as Record<string, string>).id)
    .eq('action_cards.timing', 'After a player researches a technology:')
    .not('action_cards.ability', 'is', null)
  const eligibleIds = (eligibleRows ?? []).map((r: Record<string, unknown>) => r.held_by_player_id as string)
  if (eligibleIds.length > 0) {
    await db
      .from('games')
      .update({
        pending_action_window: {
          type: 'after_technology_researched',
          eligible_player_ids: eligibleIds,
          passed_player_ids: [],
          context: { technology_name: body.tech_name },
        },
      })
      .eq('id', body.game_id)
  }

  await logEvent(db, {
    game_id: body.game_id,
    player_id: player.id,
    event_type: EVT_RESEARCH_TECH,
    payload: { player_id: player.id, technology_id: body.tech_name, technologies_before: heldTechs },
    round: 0,
    phase: 'action',
  })
  return okResponse({
    researched: true,
    ...(techPendingWindows.length > 0 && { pending_window: techPendingWindows[0] }),
  })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
