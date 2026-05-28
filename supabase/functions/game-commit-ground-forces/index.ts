import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { applyCommanderPassives } from '../_shared/leaderEffects.ts'
import { getHandler } from '../_shared/abilityHandlers.ts'
import { getHeldNotes, returnNote } from '../_shared/promissoryEnforcement.ts'

type UnitRow = { id: string; player_id: string; unit_type: string; count: number }
type UnitDef = { name: string; bombardment?: string | null; space_cannon?: string | null }
type LegendaryCardRow = { id: string; status: string }

const LEGENDARY_PLANETS = ['primor', 'hopes_end', 'mallice', 'mirage']

async function claimPlanet(
  gameId: string,
  playerId: string,
  planetName: string,
  tileId: number,
): Promise<void> {
  await db.from('game_player_planets').upsert(
    { game_id: gameId, player_id: playerId, planet_name: planetName, tile_id: tileId, exhausted: true },
    { onConflict: 'game_id,planet_name' },
  )
}

async function grantLegendaryCard(gameId: string, playerId: string, planetName: string): Promise<void> {
  if (!LEGENDARY_PLANETS.includes(planetName)) return

  const { data: existing } = await db
    .from('game_player_legendary_cards')
    .select('id, status')
    .eq('game_id', gameId)
    .eq('planet_name', planetName)
    .maybeSingle()

  if (existing) {
    await db
      .from('game_player_legendary_cards')
      .update({ player_id: playerId })
      .eq('id', (existing as LegendaryCardRow).id)
  } else {
    await db.from('game_player_legendary_cards').insert({
      game_id: gameId,
      player_id: playerId,
      planet_name: planetName,
      status: 'readied',
    })
  }

  if (planetName === 'mallice') {
    await db.from('games').update({ wormhole_nexus_active: true }).eq('id', gameId)
  }
}

async function handleCustodians(
  gameId: string,
  playerId: string,
  systemKey: string,
  game: { custodians_claimed: boolean },
): Promise<boolean> {
  if (systemKey !== '0,0' || game.custodians_claimed) return false

  await db.from('games').update({ custodians_claimed: true, agenda_unlocked: true }).eq('id', gameId)

  const { data: playerRow } = await db.from('game_players').select('vp').eq('id', playerId).maybeSingle()
  await db
    .from('game_players')
    .update({ vp: ((playerRow as { vp: number } | null)?.vp ?? 0) + 1 })
    .eq('id', playerId)

  return true
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

  let body: { game_id?: unknown; system_key?: unknown; planet_name?: unknown; troop_count?: unknown; saar_retreat_planet?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")
  if (!body.planet_name || typeof body.planet_name !== 'string') return errorResponse("'planet_name' is required")
  if (typeof body.troop_count !== 'number' || body.troop_count < 1) return errorResponse("'troop_count' must be >= 1")

  const gameId = body.game_id
  const systemKey = body.system_key
  const planetName = body.planet_name
  const troopCount = body.troop_count as number

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!player) return errorResponse('Player not found in game', 404)

  const { data: game } = await db
    .from('games')
    .select('round, map_tiles, custodians_claimed')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  // ACTIVATION: caller must have activated this system this round
  const { data: activation } = await db
    .from('game_system_activations')
    .select('*')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', (player as Record<string, string>).id)
    .eq('round', game.round)
    .maybeSingle()
  if (!activation) return errorResponse('System not activated by caller', 409)

  // TILE_ID
  const tileRef = (game.map_tiles as Record<string, { tile_id: number }>)[systemKey]
  if (!tileRef) return errorResponse('System not in map', 409)
  const tileId = tileRef.tile_id

  // TILE
  const { data: tile } = await db
    .from('tiles')
    .select('planets')
    .eq('id', tileId)
    .maybeSingle()
  if (!tile) return errorResponse('Tile not found', 404)

  // Phase 43c: apply GROUND_COMBAT_START commander passives before planet eligibility check
  const groundCombatContext: Record<string, unknown> = {
    gameId: gameId,
    activatingPlayerId: (player as Record<string, string>).id,
    systemKey: systemKey,
    sardakkExtendedCommit: false,
  }
  const { inlineEffects: gcInlineEffects, pendingWindows: gcPendingWindows } =
    await applyCommanderPassives('GROUND_COMBAT_START', groundCombatContext as never, db)
  for (const ie of gcInlineEffects) {
    const effect = (ie as Record<string, unknown>).effect
    if (typeof effect === 'string') {
      try { await getHandler(effect)(groundCombatContext as never, db) } catch { /* non-fatal */ }
    }
  }

  // PLANET_EXISTS — with Sardakk extended commitment, also allow planets from adjacent systems
  let planetDef = (tile.planets as Array<{ name: string }>)?.find(p => p.name === planetName)
  if (!planetDef && groundCombatContext.sardakkExtendedCommit) {
    // Check adjacent systems for the planet
    const [q, r] = systemKey.split(',').map(Number)
    const neighbourOffsets = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]
    const mapTilesAdj = (game.map_tiles as Record<string, { tile_id: number }>)
    for (const [dq, dr] of neighbourOffsets) {
      const adjKey = `${q+dq},${r+dr}`
      const adjTileRef = mapTilesAdj[adjKey]
      if (!adjTileRef) continue
      // Check player doesn't have own command token in adjacent system
      const { data: adjActivation } = await db
        .from('game_system_activations')
        .select('id')
        .eq('game_id', gameId)
        .eq('system_key', adjKey)
        .eq('player_id', (player as Record<string, string>).id)
        .eq('round', game.round)
        .maybeSingle()
      if (adjActivation) continue // skip systems with own token
      const { data: adjTile } = await db
        .from('tiles')
        .select('planets')
        .eq('id', adjTileRef.tile_id)
        .maybeSingle()
      if (!adjTile) continue
      const found = (adjTile.planets as Array<{ name: string }>)?.find(p => p.name === planetName)
      if (found) { planetDef = found; break }
    }
  }
  if (!planetDef) return errorResponse('Planet not found in system', 409)

  // Bombardment guard: if attacker has bombardment-capable ships, they must resolve bombardment first
  const { data: atkSpaceUnits } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', (player as Record<string, string>).id)
    .is('on_planet', null)

  const atkTypes = [...new Set((atkSpaceUnits ?? []).map((u: UnitRow) => u.unit_type))]

  const { data: bombDefs } = await db
    .from('units')
    .select('name, bombardment')
    .in('name', atkTypes.length > 0 ? atkTypes : ['__none__'])
    .not('bombardment', 'is', null)

  const activationRow = activation as Record<string, unknown>
  if ((bombDefs ?? []).length > 0 && !activationRow.bombardment_done) {
    return errorResponse('Must resolve bombardment phase before committing ground forces', 409)
  }

  // Query defenders on the planet
  const { data: defenders } = await db
    .from('game_player_units')
    .select('id, player_id, unit_type, count')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('on_planet', planetName)
    .neq('player_id', (player as Record<string, string>).id)

  // Place attacker's infantry on planet (upsert / increment)
  const { data: existingInfantry } = await db
    .from('game_player_units')
    .select('id, count')
    .eq('game_id', gameId)
    .eq('system_key', systemKey)
    .eq('player_id', (player as Record<string, string>).id)
    .eq('unit_type', 'infantry')
    .eq('on_planet', planetName)
    .maybeSingle()

  if (existingInfantry) {
    await db
      .from('game_player_units')
      .update({ count: (existingInfantry as { id: string; count: number }).count + troopCount })
      .eq('id', (existingInfantry as { id: string; count: number }).id)
  } else {
    await db.from('game_player_units').insert({
      game_id: gameId,
      system_key: systemKey,
      player_id: (player as Record<string, string>).id,
      unit_type: 'infantry',
      on_planet: planetName,
      count: troopCount,
    })
  }

  // Ragh's Call: if invader holds it, eject Saar's ground forces from invaded planet
  const raghsNotes = await getHeldNotes(gameId, "Ragh's Call", db)
  let remainingDefenders = [...(defenders ?? [])] as UnitRow[]
  const saarRetreatPlanet = typeof body.saar_retreat_planet === 'string' ? body.saar_retreat_planet : undefined
  for (const note of raghsNotes) {
    if (note.holderPlayerId !== (player as Record<string, string>).id) continue
    if (saarRetreatPlanet) {
      const { data: retreatPlanetRow } = await db
        .from('game_player_planets')
        .select('tile_id')
        .eq('game_id', gameId)
        .eq('planet_name', saarRetreatPlanet)
        .eq('player_id', note.ownerPlayerId)
        .maybeSingle()
      const retreatTileId = (retreatPlanetRow as { tile_id: number } | null)?.tile_id
      const mapTiles = game.map_tiles as Record<string, { tile_id: number }>
      const retreatSystemKey = retreatTileId !== undefined
        ? Object.entries(mapTiles).find(([, v]) => v.tile_id === retreatTileId)?.[0]
        : undefined
      if (retreatSystemKey) {
        await db
          .from('game_player_units')
          .update({ system_key: retreatSystemKey, on_planet: saarRetreatPlanet })
          .eq('game_id', gameId)
          .eq('system_key', systemKey)
          .eq('on_planet', planetName)
          .eq('player_id', note.ownerPlayerId)
      }
    }
    remainingDefenders = remainingDefenders.filter(d => d.player_id !== note.ownerPlayerId)
    await returnNote(note.instanceId, note.ownerPlayerId, db)
  }

  if (remainingDefenders.length > 0) {
    // Determine initial combat phase: check if defender has SCD units
    const defTypes = [...new Set(remainingDefenders.map(u => u.unit_type))]

    const { data: scdDefs } = await db
      .from('units')
      .select('name, space_cannon')
      .in('name', defTypes.length > 0 ? defTypes : ['__none__'])
      .not('space_cannon', 'is', null)

    const initialPhase = (scdDefs ?? []).length > 0 ? 'scd_fire' : 'attacker_roll'

    const { data: inserted } = await db
      .from('game_combats')
      .insert({
        game_id: gameId,
        system_key: systemKey,
        combat_type: 'ground',
        planet_name: planetName,
        attacker_player_id: (player as Record<string, string>).id,
        defender_player_id: remainingDefenders[0].player_id,
        phase: initialPhase,
        round: game.round,
      })
      .select('id')
      .maybeSingle()

    return okResponse({
      combat_id: (inserted as Record<string, string>).id,
      ...(gcPendingWindows.length > 0 && { pending_window: gcPendingWindows[0] }),
    })
  } else {
    // No defenders — claim the planet
    await claimPlanet(gameId, (player as Record<string, string>).id, planetName, tileId)
    await grantLegendaryCard(gameId, (player as Record<string, string>).id, planetName)
    const custodiansAwarded = await handleCustodians(
      gameId,
      (player as Record<string, string>).id,
      systemKey,
      game as { custodians_claimed: boolean },
    )
    return okResponse({
      claimed: true,
      ...(custodiansAwarded && { custodians_claimed: true }),
      ...(gcPendingWindows.length > 0 && { pending_window: gcPendingWindows[0] }),
    })
  }
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
