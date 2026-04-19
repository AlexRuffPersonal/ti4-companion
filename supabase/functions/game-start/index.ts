import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id, status, speaker_player_id, expansions')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can start the game', 403)
  if (game.status !== 'lobby') return errorResponse('Game is not in lobby state', 409)
  if (!game.speaker_player_id) return errorResponse('Speaker must be set before starting', 409)

  const { data: players, error: playersError } = await db
    .from('game_players')
    .select('id, faction, colour, display_name')
    .eq('game_id', body.game_id)
  if (playersError) return errorResponse('Database error', 500)
  if (!players || players.length === 0) return errorResponse('No players in game', 409)

  for (const player of players) {
    if (!player.faction || !player.colour) {
      return errorResponse(`Player "${player.display_name}" has not picked a faction or colour`, 409)
    }
  }

  // Initialise public objective decks (filtered by active expansions)
  const activeExpansions = Object.entries(game.expansions ?? {})
    .filter(([, active]) => active)
    .map(([exp]) => exp)

  const { data: allObjs, error: objsError } = await db
    .from('public_objectives')
    .select('id, expansion')
  if (objsError) return errorResponse('Database error', 500)

  const eligibleObjs = (allObjs ?? []).filter(
    (o: { id: string; expansion: string | null }) =>
      activeExpansions.includes(o.expansion ?? 'base')
  )

  if (eligibleObjs.length > 0) {
    const positions = eligibleObjs.map((_: unknown, i: number) => i)
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[positions[i], positions[j]] = [positions[j], positions[i]]
    }
    const { error: insertError } = await db
      .from('game_public_objectives')
      .insert(
        eligibleObjs.map((obj: { id: string }, i: number) => ({
          game_id: body.game_id,
          objective_id: obj.id,
          deck_position: positions[i],
          state: 'deck',
        }))
      )
    if (insertError) return errorResponse(`Failed to initialise objectives: ${insertError.message}`, 500)
  }

  // Initialise action card deck (filtered by active expansions, expanded by quantity)
  const { data: allActionCards, error: actionCardsError } = await db
    .from('action_cards')
    .select('id, quantity, expansion')
  if (actionCardsError) return errorResponse('Database error', 500)

  const eligibleActionCards = (allActionCards ?? []).filter(
    (c: { id: string; quantity: number; expansion: string | null }) =>
      activeExpansions.includes(c.expansion ?? 'base')
  )

  const deckEntries: Array<{ action_card_id: string; copy_index: number }> = []
  for (const card of eligibleActionCards) {
    for (let i = 0; i < (card.quantity ?? 1); i++) {
      deckEntries.push({ action_card_id: card.id, copy_index: i })
    }
  }

  if (deckEntries.length > 0) {
    const acPositions = deckEntries.map((_: unknown, i: number) => i)
    for (let i = acPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[acPositions[i], acPositions[j]] = [acPositions[j], acPositions[i]]
    }
    const { error: insertActionError } = await db
      .from('game_action_card_deck')
      .insert(
        deckEntries.map((entry: { action_card_id: string; copy_index: number }, i: number) => ({
          game_id: body.game_id,
          action_card_id: entry.action_card_id,
          copy_index: entry.copy_index,
          deck_position: acPositions[i],
          state: 'deck',
        }))
      )
    if (insertActionError) return errorResponse(`Failed to initialise action cards: ${insertActionError.message}`, 500)
  }

  // Deal 2 secret objectives per player
  const { data: allSecrets, error: secretsError } = await db
    .from('secret_objectives')
    .select('id, expansion')
  if (secretsError) return errorResponse('Database error', 500)

  const eligibleSecrets = (allSecrets ?? []).filter(
    (s: { id: string; expansion: string }) =>
      activeExpansions.includes(s.expansion ?? 'base')
  )

  const secretsNeeded = players.length * 2
  if (eligibleSecrets.length < secretsNeeded) {
    return errorResponse(
      `Not enough secret objectives in the deck (need ${secretsNeeded}, have ${eligibleSecrets.length})`,
      409
    )
  }

  // Shuffle eligible secrets
  const shuffledSecrets = [...eligibleSecrets]
  for (let i = shuffledSecrets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffledSecrets[i], shuffledSecrets[j]] = [shuffledSecrets[j], shuffledSecrets[i]]
  }

  // Deal 2 to each player
  const secretRows: Array<{ game_id: string; player_id: string; secret_objective_id: string; state: string }> = []
  let secretIdx = 0
  for (const player of players) {
    secretRows.push({ game_id: body.game_id, player_id: player.id, secret_objective_id: shuffledSecrets[secretIdx++].id, state: 'held' })
    secretRows.push({ game_id: body.game_id, player_id: player.id, secret_objective_id: shuffledSecrets[secretIdx++].id, state: 'held' })
  }

  const { error: insertSecretsError } = await db
    .from('game_player_secret_objectives')
    .insert(secretRows)
  if (insertSecretsError) return errorResponse(`Failed to deal secret objectives: ${insertSecretsError.message}`, 500)

  // Initialise starting technologies and home planets for each player
  for (const player of players) {
    const { data: factionData, error: factionError } = await db
      .from('factions')
      .select('home_tile_number, starting_techs')
      .eq('name', player.faction)
      .maybeSingle()
    if (factionError) return errorResponse('Database error', 500)
    if (!factionData) return errorResponse(`Faction not found for player "${player.display_name}"`, 409)

    // Set starting technologies
    const startingTechs = (factionData?.starting_techs ?? []) as string[]
    if (startingTechs.length > 0) {
      const { error: techError } = await db
        .from('game_players')
        .update({ technologies: startingTechs })
        .eq('id', player.id)
      if (techError) return errorResponse(`Failed to set starting techs for ${player.display_name}: ${techError.message}`, 500)
    }

    // Insert home-system planets with tech_specialty
    if (factionData?.home_tile_number) {
      const { data: tile, error: tileError } = await db
        .from('tiles')
        .select('planets')
        .eq('tile_number', factionData.home_tile_number)
        .maybeSingle()
      if (tileError) return errorResponse('Database error', 500)

      const homePlanets = (tile?.planets ?? []) as Array<{
        name: string
        tech_specialty?: string
      }>

      if (homePlanets.length > 0) {
        const { error: planetError } = await db
          .from('game_player_planets')
          .insert(
            homePlanets.map(p => ({
              game_id: body.game_id,
              player_id: player.id,
              planet_name: p.name,
              exhausted: false,
              tech_specialty: p.tech_specialty ?? null,
            }))
          )
        if (planetError) return errorResponse(`Failed to insert planets for ${player.display_name}: ${planetError.message}`, 500)
      }
    }
  }

  const { error: updateError } = await db
    .from('games')
    .update({ status: 'active' })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Failed to start game: ${updateError.message}`, 500)

  return okResponse({ started: true })
})
