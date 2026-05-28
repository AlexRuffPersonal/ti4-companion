import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { interpretEffects, ResolveContext } from '../_shared/abilityDsl.ts'
import { getHandler } from '../_shared/abilityHandlers.ts'
import { logEvent, EVT_RESOLVE_ABILITY } from '../_shared/gameEvents.ts'
import { AGENT_ABILITIES, HERO_ABILITIES, AGENT_REACTIVE_TRIGGERS } from '../_shared/leaderEffects.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; ability_definition_id?: unknown; source_type?: unknown; source_id?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (body.source_type !== 'mech') {
    if (!body.ability_definition_id || typeof body.ability_definition_id !== 'string') return errorResponse("'ability_definition_id' is required")
  }
  if (!body.source_type || typeof body.source_type !== 'string') return errorResponse("'source_type' is required")
  const VALID_SOURCE_TYPES = ['faction_ability', 'action_card', 'leader', 'relic', 'promissory_note', 'exploration_card', 'technology', 'strategy_card', 'mech']
  if (!VALID_SOURCE_TYPES.includes(body.source_type)) return errorResponse(`Invalid source_type: ${body.source_type}`)

  // 1. Find the activating player
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, action_card_count, faction')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  // 1b. Mech ability early-return branch
  if (body.source_type === 'mech') {
    if (!body.source_id || typeof body.source_id !== 'string') return errorResponse("'source_id' is required")
    const { data: unit, error: unitError } = await db
      .from('units')
      .select('id, unit_type, faction, effects')
      .eq('id', body.source_id)
      .maybeSingle()
    if (unitError) return errorResponse('Database error', 500)
    if (!unit) return errorResponse('Unit not found', 404)
    const u = unit as Record<string, unknown>
    if (u.unit_type !== 'mech') return errorResponse('Unit is not a mech', 409)
    const p = player as Record<string, string>
    if (u.faction !== p.faction) return errorResponse('Faction mismatch: unit does not belong to your faction', 409)
    const selections = ((body.selections ?? {}) as Record<string, unknown>)
    const context: ResolveContext = {
      gameId: body.game_id,
      activatingPlayerId: p.id,
      selections,
    }
    try {
      await interpretEffects((u.effects as unknown[]) ?? [], context, db)
    } catch (e: unknown) {
      const err = e as Error & { status?: number }
      return errorResponse(err.message ?? 'Resolution failed', err.status === 409 ? 409 : 500)
    }
    await logEvent(db, {
      game_id: body.game_id,
      player_id: p.id,
      event_type: EVT_RESOLVE_ABILITY,
      payload: { source_type: 'mech', source_id: body.source_id, selections },
      round: 0,
      phase: 'action',
    })
    return okResponse({ resolved: true })
  }

  // 2. Load the ability definition
  const { data: ability, error: abilityError } = await db
    .from('ability_definitions')
    .select('*')
    .eq('id', body.ability_definition_id)
    .maybeSingle()
  if (abilityError) return errorResponse('Database error', 500)
  if (!ability) return errorResponse('Ability not found', 404)

  // 3. Verify the source (skip for faction abilities — they are implicit)
  if (body.source_type !== 'faction_ability' && body.source_id) {
    const { data: source, error: sourceError } = await db
      .from('ability_sources')
      .select('id')
      .eq('ability_id', body.ability_definition_id)
      .eq('source_type', body.source_type)
      .eq('source_id', body.source_id)
      .maybeSingle()
    if (sourceError) return errorResponse('Database error', 500)
    if (!source) return errorResponse('Ability source not found', 404)
  }

  // 4. Build resolution context
  const selections = ((body.selections ?? {}) as Record<string, unknown>)
  const context: ResolveContext = {
    gameId: body.game_id,
    activatingPlayerId: (player as Record<string, string>).id,
    targetPlayerId: selections.chosen_player as string | undefined,
    targetPlanetName: selections.chosen_planet as string | undefined,
    chosenAmount: selections.chosen_amount as number | undefined,
    chosenOption: selections.chosen_option as number | undefined,
    selections,
  }

  // 5. Execute
  try {
    if ((ability as Record<string, unknown>).handler) {
      const handlerFn = getHandler((ability as Record<string, string>).handler)
      await handlerFn(context, db)
    } else {
      await interpretEffects((ability as Record<string, unknown[]>).effects, context, db)
    }
  } catch (e: unknown) {
    const err = e as Error & { status?: number }
    return errorResponse(err.message ?? 'Resolution failed', err.status === 409 ? 409 : 500)
  }

  // 6. Apply source side-effects
  const ab = ability as Record<string, unknown>
  if (ab.exhausts_source && body.source_id) {
    if (body.source_type === 'relic') {
      await db.from('game_relic_deck').update({ state: 'exhausted' }).eq('id', body.source_id)
    }
  }

  if (ab.purges_source && body.source_id) {
    if (body.source_type === 'relic') {
      await db.from('game_relic_deck').update({ state: 'purged' }).eq('id', body.source_id)
    } else if (body.source_type === 'action_card') {
      await db.from('game_action_card_deck').update({ state: 'discarded', held_by_player_id: null }).eq('id', body.source_id)
      const p = player as Record<string, number>
      await db.from('game_players').update({ action_card_count: Math.max(0, p.action_card_count - 1) }).eq('id', p.id)
    } else if (body.source_type === 'leader') {
      const { data: playerLeaders, error: playerLeadersError } = await db
        .from('game_players')
        .select('leaders')
        .eq('id', (player as Record<string, string>).id)
        .maybeSingle()
      if (playerLeadersError) return errorResponse('Database error', 500)
      const leaders = ((playerLeaders as Record<string, unknown> | null)?.leaders as Record<string, string>) ?? {}
      await db.from('game_players')
        .update({ leaders: { ...leaders, hero: 'purged' } })
        .eq('id', (player as Record<string, string>).id)
    }
  }

  // Leader (agent / hero) activation branch
  if (body.source_type === 'leader' && body.source_id) {
    const { data: leaderRow, error: leaderError } = await db
      .from('leaders')
      .select('id, faction, leader_type')
      .eq('id', body.source_id)
      .maybeSingle()
    if (leaderError) return errorResponse('Database error', 500)
    if (!leaderRow) return errorResponse('Leader not found', 404)

    const lr = leaderRow as Record<string, string>
    const { data: gpLeaders, error: gpLeadersError } = await db
      .from('game_players')
      .select('leaders')
      .eq('id', (player as Record<string, string>).id)
      .maybeSingle()
    if (gpLeadersError) return errorResponse('Database error', 500)
    const leaders = ((gpLeaders as Record<string, unknown> | null)?.leaders ?? {}) as Record<string, string>

    if (lr.leader_type === 'agent') {
      if (leaders.agent === 'exhausted') return errorResponse('Agent is already exhausted', 409)
      const ops = AGENT_ABILITIES[lr.faction]
      try {
        if (typeof ops === 'string') {
          const handlerFn = getHandler(ops)
          await handlerFn(context, db)
        } else {
          await interpretEffects(ops ?? [], context, db)
        }
      } catch (e: unknown) {
        const err = e as Error & { status?: number }
        return errorResponse(err.message ?? 'Resolution failed', err.status === 409 ? 409 : 500)
      }
      await db.from('game_players')
        .update({ leaders: { ...leaders, agent: 'exhausted' } })
        .eq('id', (player as Record<string, string>).id)
    }

    if (lr.leader_type === 'hero') {
      if (leaders.hero !== 'unlocked') return errorResponse('Hero not unlocked', 409)
      const ops = HERO_ABILITIES[lr.faction]
      try {
        if (typeof ops === 'string') {
          const handlerFn = getHandler(ops)
          await handlerFn(context, db)
        } else {
          await interpretEffects(ops ?? [], context, db)
        }
      } catch (e: unknown) {
        const err = e as Error & { status?: number }
        return errorResponse(err.message ?? 'Resolution failed', err.status === 409 ? 409 : 500)
      }
      if (lr.faction !== 'The Titans Of Ul') {
        await db.from('game_players')
          .update({ leaders: { ...leaders, hero: 'purged' } })
          .eq('id', (player as Record<string, string>).id)
      }
      // Titans: hero handler attaches card to Elysium instead; no purge write here
    }
  }

  // Phase 30: Temporal Command Suite (Nomad) — triggers when any agent is exhausted
  if (ab.exhausts_source && body.source_type === 'leader' && body.source_id) {
    const { data: allPlayers } = await db.from('game_players')
      .select('id, technologies, exhausted_technologies')
      .eq('game_id', body.game_id)

    const nomadPlayer = (allPlayers ?? []).find((p: Record<string, unknown>) => {
      const techs = (p.technologies as string[]) ?? []
      const exhausted = (p.exhausted_technologies as string[]) ?? []
      return techs.includes('Temporal Command Suite') && !exhausted.includes('Temporal Command Suite')
    })

    if (nomadPlayer) {
      const { data: leaderRow } = await db.from('game_leaders')
        .select('player_id')
        .eq('id', body.source_id)
        .maybeSingle()

      const agentOwnerPlayerId = (leaderRow as Record<string, string> | null)?.player_id

      if (agentOwnerPlayerId) {
        await logEvent(db, {
          game_id: body.game_id,
          player_id: (player as Record<string, string>).id,
          event_type: EVT_RESOLVE_ABILITY,
          payload: { player_id: (player as Record<string, string>).id, ability_key: body.ability_definition_id, targets: body.selections },
          round: 0,
          phase: 'action',
        })
        return okResponse({
          resolved: true,
          pending_window: {
            type: 'agent_exhausted',
            eligible: [(nomadPlayer as Record<string, string>).id],
            context: { exhausted_agent_id: body.source_id, agent_owner_player_id: agentOwnerPlayerId }
          }
        })
      }
    }
  }

  // Check for reactive agent windows (only when a leader is being activated)
  const trigger = ((body.selections ?? {}) as Record<string, unknown>).trigger as string | undefined
  const reactiveAgents: { player_id: string; faction: string; agent_id: string }[] = []

  if (body.source_type === 'leader' && body.source_id) {
    const { data: allGamePlayers } = await db
      .from('game_players')
      .select('id, faction, leaders')
      .eq('game_id', body.game_id)

    for (const gp of (allGamePlayers ?? [])) {
      const gpRow = gp as Record<string, unknown>
      if ((gpRow.id as string) === (player as Record<string, string>).id) continue
      const gpLeaders = (gpRow.leaders ?? {}) as Record<string, string>
      if (gpLeaders.agent !== 'unlocked') continue
      const gpFaction = gpRow.faction as string
      const triggers = AGENT_REACTIVE_TRIGGERS[gpFaction]
      if (!triggers || !trigger || !triggers.includes(trigger as never)) continue
      const { data: agentLeader } = await db
        .from('leaders')
        .select('id')
        .eq('faction', gpFaction)
        .eq('leader_type', 'agent')
        .maybeSingle()
      if (agentLeader) {
        reactiveAgents.push({ player_id: gpRow.id as string, faction: gpFaction, agent_id: (agentLeader as Record<string, string>).id })
      }
    }
  }

  await logEvent(db, {
    game_id: body.game_id,
    player_id: (player as Record<string, string>).id,
    event_type: EVT_RESOLVE_ABILITY,
    payload: { player_id: (player as Record<string, string>).id, ability_key: body.ability_definition_id, targets: body.selections },
    round: 0,
    phase: 'action',
  })

  if (reactiveAgents.length > 0) {
    return okResponse({
      resolved: true,
      pending_window: {
        type: 'reactive_agent',
        eligible: reactiveAgents,
        context: { trigger, ...((body.selections ?? {}) as Record<string, unknown>) },
      },
    })
  }

  return okResponse({ resolved: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
