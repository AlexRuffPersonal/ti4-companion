import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type DeckConfig = { table: string; extraFilters?: Record<string, string> }

const DECK_CONFIGS: Record<string, DeckConfig> = {
  action_cards:           { table: 'game_action_card_deck' },
  agenda:                 { table: 'game_agenda_deck' },
  relics:                 { table: 'game_relic_deck' },
  exploration_cultural:   { table: 'game_exploration_decks', extraFilters: { deck_type: 'cultural' } },
  exploration_industrial: { table: 'game_exploration_decks', extraFilters: { deck_type: 'industrial' } },
  exploration_hazardous:  { table: 'game_exploration_decks', extraFilters: { deck_type: 'hazardous' } },
  exploration_frontier:   { table: 'game_exploration_decks', extraFilters: { deck_type: 'frontier' } },
}

const VALID_DECK_TYPES = [
  'public_objectives_1', 'public_objectives_2', ...Object.keys(DECK_CONFIGS)
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; deck_type?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.deck_type || typeof body.deck_type !== 'string') return errorResponse("'deck_type' is required")
  if (!VALID_DECK_TYPES.includes(body.deck_type)) {
    return errorResponse(`Invalid deck_type. Valid values: ${VALID_DECK_TYPES.join(', ')}`)
  }

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can shuffle decks', 403)

  // Resolve rows to shuffle
  let rows: { id: string }[] = []
  let tableName: string

  if (body.deck_type === 'public_objectives_1' || body.deck_type === 'public_objectives_2') {
    tableName = 'game_public_objectives'
    const stage = body.deck_type === 'public_objectives_1' ? 1 : 2
    const { data: stageObjs } = await db.from('public_objectives').select('id').eq('stage', stage)
    const stageIds = (stageObjs ?? []).map((o: { id: string }) => o.id)
    const { data, error } = await db
      .from('game_public_objectives')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('state', 'deck')
      .in('objective_id', stageIds)
    if (error) return errorResponse('Database error', 500)
    rows = data ?? []
  } else {
    const config = DECK_CONFIGS[body.deck_type]
    tableName = config.table
    let query = db.from(tableName).select('id').eq('game_id', body.game_id).eq('state', 'deck')
    for (const [k, v] of Object.entries(config.extraFilters ?? {})) {
      query = query.eq(k, v)
    }
    const { data, error } = await query
    if (error) return errorResponse('Database error', 500)
    rows = data ?? []
  }

  if (rows.length === 0) return okResponse({ shuffled: 0 })

  // Fisher-Yates shuffle of positions
  const positions = rows.map((_, i) => i)
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[positions[i], positions[j]] = [positions[j], positions[i]]
  }

  for (let i = 0; i < rows.length; i++) {
    const { error } = await db
      .from(tableName)
      .update({ deck_position: positions[i] })
      .eq('id', rows[i].id)
    if (error) return errorResponse(`Shuffle failed: ${error.message}`, 500)
  }

  return okResponse({ shuffled: rows.length })
})
