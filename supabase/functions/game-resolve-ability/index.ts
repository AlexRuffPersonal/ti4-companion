import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { interpretEffects, ResolveContext } from '../_shared/abilityDsl.ts'
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

  let body: { game_id?: unknown; ability_definition_id?: unknown; source_type?: unknown; source_id?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.ability_definition_id || typeof body.ability_definition_id !== 'string') return errorResponse("'ability_definition_id' is required")
  if (!body.source_type || typeof body.source_type !== 'string') return errorResponse("'source_type' is required")
  const VALID_SOURCE_TYPES = ['faction_ability', 'action_card', 'leader', 'relic', 'promissory_note', 'exploration_card', 'technology', 'strategy_card']
  if (!VALID_SOURCE_TYPES.includes(body.source_type)) return errorResponse(`Invalid source_type: ${body.source_type}`)

  // 1. Find the activating player
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, action_card_count')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

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

  return okResponse({ resolved: true })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
