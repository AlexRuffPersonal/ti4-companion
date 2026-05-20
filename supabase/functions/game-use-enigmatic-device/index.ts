import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { applyAbility } from '../_shared/abilityDsl.ts'

type PlanetRow = {
  id: string
  planet_name: string
  tile_id: string | null
  exhausted: boolean
}

type TilePlanet = {
  name: string
  resources: number
}

type TileRow = {
  id: string
  planets: TilePlanet[] | null
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

  let body: {
    game_id?: unknown
    player_id?: unknown
    card_id?: unknown
    resource_planet_names?: unknown
    technology_name?: unknown
  }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }

  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.player_id || typeof body.player_id !== 'string') return errorResponse("'player_id' is required")
  if (!body.card_id || typeof body.card_id !== 'string') return errorResponse("'card_id' is required")
  if (!body.resource_planet_names || !Array.isArray(body.resource_planet_names)) return errorResponse("'resource_planet_names' is required and must be an array")
  if (!body.technology_name || typeof body.technology_name !== 'string') return errorResponse("'technology_name' is required")

  const gameId = body.game_id
  const playerId = body.player_id
  const cardId = body.card_id
  const resourcePlanetNames = body.resource_planet_names as string[]
  const technologyName = body.technology_name

  // PLAYER
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  // Fetch the card
  const { data: card, error: cardError } = await db
    .from('game_exploration_decks')
    .select('id, state, resolved_by_player_id, name')
    .eq('id', cardId)
    .eq('game_id', gameId)
    .maybeSingle()
  if (cardError) return errorResponse('Database error', 500)
  if (!card) return errorResponse('Card not found', 404)

  const cardRow = card as { id: string; state: string; resolved_by_player_id: string | null; name: string }

  if (cardRow.state !== 'held') return errorResponse('Card not in held state', 409)
  if (cardRow.resolved_by_player_id !== playerId) return errorResponse('Not your card', 409)
  if (cardRow.name !== 'Enigmatic Device') return errorResponse('Card is not an Enigmatic Device', 409)

  // Validate resource planets
  const { data: planets, error: planetsError } = await db
    .from('game_player_planets')
    .select('id, planet_name, tile_id, exhausted')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .in('planet_name', resourcePlanetNames)
  if (planetsError) return errorResponse('Database error', 500)

  const planetList = (planets ?? []) as PlanetRow[]
  if (planetList.length !== resourcePlanetNames.length) {
    return errorResponse('One or more planets not found or not controlled', 409)
  }

  for (const planet of planetList) {
    if (planet.exhausted) return errorResponse('One or more planets are already exhausted', 409)
  }

  // Sum resources via tile reference
  const tileIds = [...new Set(planetList.map(p => p.tile_id).filter((id): id is string => id !== null))]

  const { data: tiles, error: tilesError } = await db
    .from('tiles')
    .select('id, planets')
    .in('id', tileIds)
  if (tilesError) return errorResponse('Database error', 500)

  const tileMap = new Map<string, TileRow>()
  for (const tile of (tiles ?? []) as TileRow[]) {
    tileMap.set(tile.id, tile)
  }

  let totalResources = 0
  for (const planet of planetList) {
    if (!planet.tile_id) continue
    const tile = tileMap.get(planet.tile_id)
    if (!tile) continue
    const tilePlanet = (tile.planets ?? []).find(p => p.name === planet.planet_name)
    if (tilePlanet) totalResources += tilePlanet.resources ?? 0
  }

  if (totalResources < 6) return errorResponse('Insufficient resources (need 6)', 409)

  // Research technology via applyAbility (handles prereq check + tech array update)
  try {
    await applyAbility(
      [{ op: 'gain_technology' }],
      {
        gameId,
        activatingPlayerId: playerId,
        selections: { technology_name: technologyName },
      },
      db
    )
  } catch (e: unknown) {
    const err = e as Error & { status?: number }
    return errorResponse(err.message ?? 'Failed to research technology', err.status === 409 ? 409 : 500)
  }

  // Exhaust chosen planets
  const { error: exhaustError } = await db
    .from('game_player_planets')
    .update({ exhausted: true })
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .in('planet_name', resourcePlanetNames)
  if (exhaustError) return errorResponse('Failed to exhaust planets', 500)

  // Purge card
  const { error: purgeError } = await db
    .from('game_exploration_decks')
    .update({ state: 'purged', resolved_by_player_id: null })
    .eq('id', cardId)
  if (purgeError) return errorResponse('Failed to purge card', 500)

  return okResponse({ technology: technologyName })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
