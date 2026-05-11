import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const VALID_DECK_TYPES = ['cultural', 'hazardous', 'industrial'] as const
type DeckType = typeof VALID_DECK_TYPES[number]

type PlanetRow = {
  id: string
  game_id: string
  player_id: string
  planet_name: string
  tile_id: string
  exhausted: boolean
  explored: boolean
}

type TileRow = {
  id: string
  planets: Array<{ name: string; type: string[] }>
}

type DeckCardRow = {
  id: string
  name: string
  text: string
  has_attachment: boolean
  relic_fragment_type: string | null
  state: string
  deck_position: number
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; player_id?: unknown; planet_name?: unknown; deck_type?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }

  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.player_id || typeof body.player_id !== 'string') return errorResponse("'player_id' is required")
  if (!body.planet_name || typeof body.planet_name !== 'string') return errorResponse("'planet_name' is required")
  if (!body.deck_type || typeof body.deck_type !== 'string') return errorResponse("'deck_type' is required")

  const game_id = body.game_id
  const player_id = body.player_id
  const planet_name = body.planet_name
  const deck_type = body.deck_type as string

  // Validate deck_type
  if (!(VALID_DECK_TYPES as readonly string[]).includes(deck_type)) {
    return errorResponse("'deck_type' must be one of: cultural, hazardous, industrial", 400)
  }

  const validDeckType = deck_type as DeckType

  // Fetch game to verify it exists
  const { data: game, error: gameError } = await db
    .from('games')
    .select('phase, active_player_id, map_tiles')
    .eq('id', game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  // Fetch the player
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  // Fetch planet from game_player_planets
  const { data: planetRow, error: planetError } = await db
    .from('game_player_planets')
    .select('id, game_id, player_id, planet_name, tile_id, exhausted, explored')
    .eq('game_id', game_id)
    .eq('player_id', player_id)
    .eq('planet_name', planet_name)
    .maybeSingle()
  if (planetError) return errorResponse('Database error', 500)
  if (!planetRow) return errorResponse('Planet not controlled', 409)

  const planet = planetRow as PlanetRow
  if (planet.explored) return errorResponse('Planet already explored', 409)

  // Validate deck_type matches planet traits
  const { data: tileRow, error: tileError } = await db
    .from('tiles')
    .select('id, planets')
    .eq('id', planet.tile_id)
    .maybeSingle()
  if (tileError) return errorResponse('Database error', 500)

  if (tileRow) {
    const tile = tileRow as TileRow
    const planetDef = (tile.planets ?? []).find(
      (p: { name: string; type: string[] }) => p.name.toLowerCase() === planet_name.toLowerCase()
    )
    if (planetDef) {
      const traitList: string[] = planetDef.type ?? []
      if (traitList.length > 0 && !traitList.includes(validDeckType)) {
        return errorResponse('Invalid deck for planet trait', 409)
      }
    }
  }

  // Draw top card from deck
  let card = await drawTopCard(game_id, validDeckType)

  if (!card) {
    // Try reshuffling discards
    const { data: discards, error: discardFetchError } = await db
      .from('game_exploration_decks')
      .select('id')
      .eq('game_id', game_id)
      .eq('deck_type', validDeckType)
      .eq('state', 'discarded')
    if (discardFetchError) return errorResponse('Database error', 500)

    const discardList = (discards ?? []) as Array<{ id: string }>
    if (discardList.length === 0) return errorResponse('Exploration deck empty', 409)

    // Reshuffle: assign random deck_position to each discard, set state='deck'
    for (const discard of discardList) {
      const { error: reshuffleError } = await db
        .from('game_exploration_decks')
        .update({ state: 'deck', deck_position: Math.random() * 1000 })
        .eq('id', discard.id)
      if (reshuffleError) return errorResponse('Database error', 500)
    }

    card = await drawTopCard(game_id, validDeckType)
    if (!card) return errorResponse('Exploration deck empty', 409)
  }

  // Mark card as drawn
  const { error: updateError } = await db
    .from('game_exploration_decks')
    .update({ state: 'drawn', resolved_by_player_id: player_id })
    .eq('id', card.id)
  if (updateError) return errorResponse('Database error', 500)

  // Mark planet as explored
  const { error: exploreError } = await db
    .from('game_player_planets')
    .update({ explored: true })
    .eq('id', planet.id)
  if (exploreError) return errorResponse('Database error', 500)

  return okResponse({
    card_id: card.id,
    card_name: card.name,
    card_text: card.text,
    has_attachment: card.has_attachment,
    relic_fragment_type: card.relic_fragment_type,
  })
}

async function drawTopCard(game_id: string, deck_type: DeckType): Promise<DeckCardRow | null> {
  const { data, error } = await db
    .from('game_exploration_decks')
    .select('id, name, text, has_attachment, relic_fragment_type, state, deck_position')
    .eq('game_id', game_id)
    .eq('deck_type', deck_type)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data as DeckCardRow | null
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
