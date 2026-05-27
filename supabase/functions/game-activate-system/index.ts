import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { logEvent, EVT_ACTIVATE_SYSTEM } from '../_shared/gameEvents.ts'
import { AGENT_REACTIVE_TRIGGERS, applyCommanderPassives } from '../_shared/leaderEffects.ts'
import { getHandler } from '../_shared/abilityHandlers.ts'
import { getHeldNotes, getActiveNotes, returnNote } from '../_shared/promissoryEnforcement.ts'

type UnitRow = { player_id: string; unit_type: string; count: number; system_key: string }
type ScDef = { name: string; space_cannon: string }
type TileRow = { id: string; wormhole: string | null; anomalies?: string[] | null }
type MapTileRef = { tile_id: string }
type PlayerRow = {
  id: string
  technologies?: string[]
  exhausted_technologies?: string[]
  trade_goods?: number
  promissory_notes?: unknown[]
  command_tokens?: Record<string, number>
  faction?: string
  leaders?: Record<string, string>
}

function parseDiceCount(text: string): number {
  const m = text.match(/\(x(\d+)\)/)
  return m ? parseInt(m[1]) : 1
}

function axialNeighbors(systemKey: string): string[] {
  const [q, r] = systemKey.split(',').map(Number)
  return [
    [q + 1, r], [q - 1, r],
    [q, r + 1], [q, r - 1],
    [q + 1, r - 1], [q - 1, r + 1],
  ].map(([nq, nr]) => `${nq},${nr}`)
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

  let body: { game_id?: unknown; system_key?: unknown; movement_payload?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.system_key || typeof body.system_key !== 'string') return errorResponse("'system_key' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, command_tokens, technologies, exhausted_technologies, trade_goods, promissory_notes, faction, leaders')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in game', 404)

  const technologies: string[] = (player.technologies ?? []) as string[]

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, active_player_id, round, map_tiles')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.active_player_id !== player.id) return errorResponse('Not the active player', 409)

  const tokens = player.command_tokens as { tactic_total: number; fleet: number; strategy: number }
  const tacticTotal = tokens?.tactic_total ?? 0

  const { data: activations, error: activationError } = await db
    .from('game_system_activations')
    .select('id, system_key')
    .eq('game_id', body.game_id)
    .eq('player_id', player.id)
    .eq('round', game.round)
  if (activationError) return errorResponse('Database error', 500)

  if ((activations ?? []).length >= tacticTotal) return errorResponse('No tactic tokens available', 409)

  const leaders = (player.leaders ?? {}) as Record<string, string>
  const isMahact = player.faction === 'The Mahact Gene-Sorcerers' && leaders.commander === 'unlocked'
  const alreadyActivatedThisSystem = (activations ?? []).some(
    (a: { system_key: string }) => a.system_key === body.system_key
  )
  if (isMahact && alreadyActivatedThisSystem) {
    const resolveCtx = { gameId: body.game_id, activatingPlayerId: player.id, systemKey: body.system_key }
    await getHandler('mahact_il_na_viroset')(resolveCtx as any, db)
    // don't return 409 — fall through to proceed with activation
  } else if (alreadyActivatedThisSystem) {
    return errorResponse('System already activated by you this round', 409)
  }

  // Build relevant system set: activated + axial neighbors + wormhole-connected
  const neighborKeys = axialNeighbors(body.system_key)
  const mapTiles = (game.map_tiles ?? {}) as Record<string, MapTileRef>
  const tileIds = Object.values(mapTiles).map((t) => t.tile_id)

  // Non-critical: if tiles query fails, fall back to no wormhole connections
  const { data: tilesData } = await db
    .from('tiles')
    .select('id, wormhole, anomalies')
    .in('id', tileIds.length > 0 ? tileIds : ['__none__'])

  const activatedTileRef = mapTiles[body.system_key]
  const activatedTile = activatedTileRef
    ? (tilesData ?? []).find((t: TileRow) => t.id === activatedTileRef.tile_id)
    : null
  const isAsteroidField = (activatedTile?.anomalies ?? []).includes('asteroid_field')

  const sysWormholes: Record<string, string> = {}
  for (const [sk, ref] of Object.entries(mapTiles)) {
    const tile = (tilesData ?? []).find((t: TileRow) => t.id === ref.tile_id)
    if (tile?.wormhole) sysWormholes[sk] = tile.wormhole
  }
  const activatedWh = sysWormholes[body.system_key]
  const whConnected: string[] = activatedWh
    ? Object.entries(sysWormholes)
        .filter(([sk, wh]) => sk !== body.system_key && wh === activatedWh)
        .map(([sk]) => sk)
    : []

  const relevantSystems = [body.system_key, ...neighborKeys, ...whConnected]

  // Load all players once — used for Chaos Mapping check, reactive tech effects, and reactive agent windows
  const { data: allGamePlayers } = await db
    .from('game_players')
    .select('id, technologies, exhausted_technologies, trade_goods, promissory_notes, faction, leaders')
    .eq('game_id', body.game_id)

  // Single fetch: all space units for this game
  const { data: allSpaceUnits } = await db
    .from('game_player_units')
    .select('player_id, unit_type, count, system_key')
    .eq('game_id', body.game_id)
    .is('on_planet', null)

  // Chaos Mapping: block if Saar player has ships in an asteroid field being activated
  if (isAsteroidField) {
    const chaosMappingPlayer = (allGamePlayers ?? []).find(
      (p: PlayerRow) => p.id !== player.id && (p.technologies ?? []).includes('Chaos Mapping')
    )
    if (chaosMappingPlayer) {
      const hasSaarShipsHere = (allSpaceUnits ?? []).some(
        (u: UnitRow) => u.system_key === body.system_key && u.player_id === chaosMappingPlayer.id
      )
      if (hasSaarShipsHere) {
        return errorResponse('Cannot activate asteroid field containing Saar ships', 409)
      }
    }
  }

  const enemyUnits = (allSpaceUnits ?? []).filter(
    (u: UnitRow) => u.system_key === body.system_key && u.player_id !== player.id
  )

  let combatId: string | null = null

  if (enemyUnits.length > 0) {
    const defenderPlayerId = enemyUnits[0].player_id

    const relevantUnits = (allSpaceUnits ?? []).filter((u: UnitRow) =>
      relevantSystems.includes(u.system_key)
    )

    // Get space cannon unit definitions
    const { data: scDefs } = await db
      .from('units')
      .select('name, space_cannon')
      .not('space_cannon', 'is', null)

    const scMap = new Map((scDefs ?? []).map((u: ScDef) => [u.name, u.space_cannon]))

    // Build space_cannon_pending
    type SpEntry = { player_id: string; system_key: string; unit_type: string; dice_count: number; resolved: boolean }
    const spPending: SpEntry[] = []
    const seen = new Set<string>()

    for (const unit of relevantUnits) {
      if (!scMap.has(unit.unit_type)) continue
      const key = `${unit.player_id}:${unit.system_key}`
      if (seen.has(key)) continue
      seen.add(key)
      spPending.push({
        player_id: unit.player_id,
        system_key: unit.system_key,
        unit_type: unit.unit_type,
        dice_count: parseDiceCount(scMap.get(unit.unit_type)!),
        resolved: false,
      })
    }

    const shipsMovedIn = (body.movement_payload as Array<{ origin_system_key?: string }> ?? []).some(
      (ship) => ship.origin_system_key !== body.system_key
    )

    const { data: combatRows, error: combatInsertError } = await db
      .from('game_combats')
      .insert({
        game_id: body.game_id,
        system_key: body.system_key,
        attacker_player_id: player.id,
        defender_player_id: defenderPlayerId,
        phase: 'window_pre_space_cannon',
        space_cannon_pending: spPending,
        ships_moved_in: shipsMovedIn,
      })
      .select('id')
    if (combatInsertError) return errorResponse(`Failed to create combat: ${combatInsertError.message}`, 500)
    combatId = combatRows?.[0]?.id ?? null

    // Reactive tech effects for ships entering system
    const enemyPlayerIds = new Set(enemyUnits.map((u: UnitRow) => u.player_id))
    const enemyPlayers = (allGamePlayers ?? []).filter((p: PlayerRow) => enemyPlayerIds.has(p.id))

    for (const opp of enemyPlayers) {
      const oppTechs = (opp.technologies ?? []) as string[]
      const oppExhausted = (opp.exhausted_technologies ?? []) as string[]

      // Voidwatch (Empyrean): take 1 promissory note from activating player
      if (oppTechs.includes('Voidwatch')) {
        const promNotes = (player.promissory_notes ?? []) as unknown[]
        if (promNotes.length > 0) {
          const [note, ...rest] = promNotes
          const oppNotes = (opp.promissory_notes ?? []) as unknown[]
          await db.from('game_players').update({ promissory_notes: rest }).eq('id', player.id)
          await db.from('game_players').update({ promissory_notes: [...oppNotes, note] }).eq('id', opp.id)
        }
      }

      // Neuroglaive (Naalu): activating player loses 1 fleet token
      if (oppTechs.includes('Neuroglaive')) {
        const activatorTokens = player.command_tokens as { tactic_total: number; fleet: number; strategy: number }
        const newFleet = Math.max(0, (activatorTokens?.fleet ?? 0) - 1)
        await db.from('game_players').update({
          command_tokens: { ...activatorTokens, fleet: newFleet },
        }).eq('id', player.id)
      }

      // E-Res Siphons (Jol-Nar): opponent gains 4 trade goods
      if (oppTechs.includes('E-Res Siphons')) {
        await db.from('game_players').update({
          trade_goods: (opp.trade_goods ?? 0) + 4,
        }).eq('id', opp.id)
      }

      // Nullification Field: open action window (if not exhausted)
      if (oppTechs.includes('Nullification Field') && !oppExhausted.includes('Nullification Field')) {
        await db.from('game_players').update({
          pending_action_window: {
            type: 'when_ships_enter_system',
            eligible: [opp.id],
            context: { activating_player_id: player.id },
          },
        }).eq('id', opp.id)
      }
    }
  }

  // --- Promissory Note Enforcement: Ceasefire (Model D, held) ---
  // Check before inserting the activation row so we can 409 early
  const ceasefireNotes = await getHeldNotes(body.game_id, 'Ceasefire', db)
  for (const note of ceasefireNotes) {
    if (note.ownerPlayerId === player.id) {
      // Check if holder has units in the activated system
      const holderUnitsInSystem = (allSpaceUnits ?? []).some(
        (u: UnitRow) => u.player_id === note.holderPlayerId && u.system_key === body.system_key
      )
      if (holderUnitsInSystem) {
        await returnNote(note.instanceId, note.ownerPlayerId, db)
        return errorResponse('Ceasefire is in effect', 409)
      }
    }
  }

  const { data: insertedRows, error: insertError } = await db
    .from('game_system_activations')
    .insert({
      game_id: body.game_id,
      player_id: player.id,
      system_key: body.system_key,
      round: game.round,
      token_owner_id: player.id,
    })
    .select('id')
  if (insertError) return errorResponse(`Failed to activate system: ${insertError.message}`, 500)

  const activationId = insertedRows?.[0]?.id ?? null

  // --- Promissory Note Enforcement: Post-activation checks ---

  // Greyfire Mutagen (Model D, held): block faction abilities of note owner.
  // This trigger is unconditional per spec — the note is consumed on ANY activation in the game
  // while it is held, regardless of who holds it or who is activating.
  const greyfireNotes = await getHeldNotes(body.game_id, 'Greyfire Mutagen', db)
  for (const note of greyfireNotes) {
    if (activationId) {
      await db
        .from('game_system_activations')
        .update({ faction_abilities_blocked_player_id: note.ownerPlayerId })
        .eq('id', activationId)
    }
    await returnNote(note.instanceId, note.ownerPlayerId, db)
  }

  // Crucible (Model D, held): holder activating their own system grants gravity rift immunity
  const crucibleNotes = await getHeldNotes(body.game_id, 'Crucible', db)
  for (const note of crucibleNotes) {
    if (note.holderPlayerId === player.id && activationId) {
      await db
        .from('game_system_activations')
        .update({ gravity_rift_immune_player_id: note.holderPlayerId })
        .eq('id', activationId)
      await returnNote(note.instanceId, note.ownerPlayerId, db)
    }
  }

  // Model B in_play return checks
  const activeNotes = await getActiveNotes(body.game_id, db)
  const modelBKeys = ['tradeConvoys', 'promiseOfProtection', 'bloodPact', 'darkPact', 'stymie', 'antivirus'] as const // crucible is Model D (handled above via getHeldNotes)
  for (const key of modelBKeys) {
    for (const note of activeNotes[key]) {
      if (note.holderPlayerId === player.id) {
        // Check if owner has units in the activated system
        const ownerUnitsInSystem = (allSpaceUnits ?? []).some(
          (u: UnitRow) => u.player_id === note.ownerPlayerId && u.system_key === body.system_key
        )
        if (ownerUnitsInSystem) {
          await returnNote(note.instanceId, note.ownerPlayerId, db)
        }
      }
    }
  }

  await logEvent(db, {
    game_id: body.game_id,
    player_id: player.id,
    event_type: EVT_ACTIVATE_SYSTEM,
    payload: { player_id: player.id, system_key: body.system_key },
    round: game.round,
    phase: 'action',
  })

  // Check for reactive agents triggered by SYSTEM_ACTIVATED
  // Reuse allGamePlayers (already fetched above); filter out the activating player
  type LeaderRow = { id: string }
  const reactiveAgents: Array<{ player_id: string; faction: string; agent_id: string }> = []

  for (const otherPlayer of (allGamePlayers ?? []) as PlayerRow[]) {
    if (otherPlayer.id === player.id) continue
    const leaders = (otherPlayer.leaders ?? {}) as Record<string, string>
    if (leaders.agent !== 'unlocked') continue
    const faction = otherPlayer.faction ?? ''
    if (!AGENT_REACTIVE_TRIGGERS[faction]?.includes('SYSTEM_ACTIVATED')) continue

    const { data: leaderRow } = await db
      .from('leaders')
      .select('id')
      .eq('faction', faction)
      .eq('leader_type', 'agent')
      .maybeSingle()

    const leader = leaderRow as LeaderRow | null
    if (leader) {
      reactiveAgents.push({ player_id: otherPlayer.id, faction, agent_id: leader.id })
    }
  }

  const reactiveAgentWindow = reactiveAgents.length > 0
    ? { type: 'reactive_agent', eligible: reactiveAgents, context: { trigger: 'SYSTEM_ACTIVATED', system_key: body.system_key } }
    : undefined

  // Apply SYSTEM_ACTIVATED commander passives (Arborec, Yssaril, etc.)
  const { pendingWindows: commanderWindows } = await applyCommanderPassives(
    'SYSTEM_ACTIVATED',
    { gameId: body.game_id, activatingPlayerId: player.id, systemKey: body.system_key, faction: (player.faction ?? '') as string },
    db,
  )

  const allWindows = [
    ...(reactiveAgentWindow ? [reactiveAgentWindow] : []),
    ...commanderWindows,
  ]

  return okResponse({ activated: true, combat_id: combatId, pending_window: allWindows[0] ?? undefined })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
