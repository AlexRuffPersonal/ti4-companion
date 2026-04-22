import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const INNER_TILE_NUMBERS = [
  '18',
  '32','30','35','36','29','34',
  '26','22','31','21','25','27','23','24','28','20','19','33',
  '37','38','39','40','41','42','43','44','45','46','47','48',
]

const INNER_POSITIONS = [
  '0,0',
  '1,-1','1,0','0,1','-1,1','-1,0','0,-1',
  '2,-2','2,-1','2,0','1,1','0,2','-1,2','-2,2','-2,1','-2,0','-1,-1','0,-2','1,-2',
  '3,-2','3,-1','2,1','1,2','-1,3','-2,3','-3,2','-3,1','-2,-1','-1,-2','1,-3','2,-3',
]

const HOME_POSITIONS = ['3,-3','3,0','0,3','-3,3','-3,0','0,-3']

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

  // Deal promissory notes (faction + generic)
  const { data: allNotes, error: notesError } = await db
    .from('promissory_notes')
    .select('id, faction, expansion')
  if (notesError) return errorResponse('Database error', 500)

  const eligibleNotes = (allNotes ?? []).filter(
    (n: { id: string; faction: string | null; expansion: string | null }) =>
      activeExpansions.includes(n.expansion ?? 'base')
  )

  // Collect notes to deal: faction notes + generic notes
  const notesToDeal: Array<{ game_id: string; player_id: string; note_id: string; state: string; origin_player_id: string }> = []

  for (const player of players) {
    // Faction notes: match player's faction
    const factionNotes = eligibleNotes.filter((n: { faction: string | null }) => n.faction === player.faction)
    for (const note of factionNotes) {
      notesToDeal.push({
        game_id: body.game_id,
        player_id: player.id,
        note_id: note.id,
        state: 'held',
        origin_player_id: player.id,
      })
    }

    // Generic notes: deal one copy to every player
    const genericNotes = eligibleNotes.filter((n: { faction: string | null }) => n.faction === null)
    for (const note of genericNotes) {
      notesToDeal.push({
        game_id: body.game_id,
        player_id: player.id,
        note_id: note.id,
        state: 'held',
        origin_player_id: player.id,
      })
    }
  }

  if (notesToDeal.length > 0) {
    const { error: insertNotesError } = await db
      .from('game_player_promissory_notes')
      .insert(notesToDeal)
    if (insertNotesError) return errorResponse(`Failed to deal promissory notes: ${insertNotesError.message}`, 500)
  }

  // Initialise agenda deck (filtered by active expansions)
  const { data: allAgendas, error: agendasError } = await db
    .from('agendas')
    .select('id, expansion')
  if (agendasError) return errorResponse('Database error', 500)

  const eligibleAgendas = (allAgendas ?? []).filter(
    (a: { id: string; expansion: string }) =>
      activeExpansions.includes(a.expansion ?? 'base')
  )

  if (eligibleAgendas.length > 0) {
    const agendaPositions = eligibleAgendas.map((_: unknown, i: number) => i)
    for (let i = agendaPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[agendaPositions[i], agendaPositions[j]] = [agendaPositions[j], agendaPositions[i]]
    }
    const { error: insertAgendasError } = await db
      .from('game_agenda_deck')
      .insert(
        eligibleAgendas.map((ag: { id: string }, i: number) => ({
          game_id: body.game_id,
          agenda_id: ag.id,
          deck_position: agendaPositions[i],
          state: 'deck',
        }))
      )
    if (insertAgendasError) return errorResponse(`Failed to initialise agenda deck: ${insertAgendasError.message}`, 500)
  }

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
        influence?: number
        resources?: number
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
              influence: p.influence ?? 0,
              resources: p.resources ?? 0
            }))
          )
        if (planetError) return errorResponse(`Failed to insert planets for ${player.display_name}: ${planetError.message}`, 500)
      }
    }
  }

  // Seed map_tiles
  const { data: allTiles, error: tilesError } = await db
    .from('tiles')
    .select('id, tile_number')
  if (tilesError) return errorResponse('Database error', 500)

  const tileByNumber = new Map<string, string>()
  for (const t of (allTiles ?? []) as Array<{ id: string; tile_number: string }>) {
    tileByNumber.set(String(t.tile_number), t.id)
  }

  const mapTiles: Record<string, { tile_id: string; tile_number: string }> = {}
  for (let i = 0; i < INNER_POSITIONS.length; i++) {
    const tileNumber = INNER_TILE_NUMBERS[i]
    const tileId = tileByNumber.get(tileNumber)
    if (tileId) mapTiles[INNER_POSITIONS[i]] = { tile_id: tileId, tile_number: tileNumber }
  }

  // Assign home systems to corner positions in join order
  const homeTileNumbers: string[] = []
  for (const player of players) {
    const { data: fd } = await db
      .from('factions')
      .select('home_tile_number')
      .eq('name', player.faction)
      .maybeSingle()
    homeTileNumbers.push(fd?.home_tile_number ? String(fd.home_tile_number) : '')
  }

  for (let i = 0; i < players.length && i < HOME_POSITIONS.length; i++) {
    const homeTileNumber = homeTileNumbers[i]
    const homeTileId = homeTileNumber ? tileByNumber.get(homeTileNumber) : undefined
    if (homeTileId && homeTileNumber) {
      mapTiles[HOME_POSITIONS[i]] = { tile_id: homeTileId, tile_number: homeTileNumber }
    }
  }

  const { error: mapError } = await db
    .from('games')
    .update({ map_tiles: mapTiles })
    .eq('id', body.game_id)
  if (mapError) return errorResponse(`Failed to seed map tiles: ${mapError.message}`, 500)

  const { error: updateError } = await db
    .from('games')
    .update({ status: 'active' })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Failed to start game: ${updateError.message}`, 500)

  return okResponse({ started: true })
})
