import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

type PlayerRow = Record<string, unknown>

export async function checkAndEliminate(db: SupabaseClient, gameId: string): Promise<string[]> {
  const { data: players, error } = await db
    .from('game_players')
    .select('*')
    .eq('game_id', gameId)
    .eq('eliminated', false)

  if (error) throw new Error(`Failed to load players: ${error.message}`)
  if (!players) return []

  const eliminatedIds: string[] = []
  for (const player of players) {
    const eligible = await isEliminationEligible(db, gameId, player as PlayerRow)
    if (eligible) {
      await eliminate(db, gameId, player as PlayerRow)
      eliminatedIds.push(player.id as string)
    }
  }
  return eliminatedIds
}

async function isEliminationEligible(db: SupabaseClient, gameId: string, player: PlayerRow): Promise<boolean> {
  const { data: productionUnitDefs } = await db.from('units').select('name').not('production', 'is', null)
  const productionTypes = (productionUnitDefs ?? []).map((u: { name: string }) => u.name)

  let hasProduction = false
  if (productionTypes.length > 0) {
    const { data: productionUnits } = await db.from('game_player_units').select('id').eq('player_id', player.id).eq('game_id', gameId).in('unit_type', productionTypes).limit(1)
    hasProduction = (productionUnits?.length ?? 0) > 0
  }

  const { data: groundForces } = await db.from('game_player_units').select('id').eq('player_id', player.id).eq('game_id', gameId).in('unit_type', ['infantry', 'mech']).limit(1)
  const hasGroundForces = (groundForces?.length ?? 0) > 0

  const { data: planets } = await db.from('game_system_state').select('id').eq('controller_player_id', player.id).eq('game_id', gameId).limit(1)
  const hasPlanets = (planets?.length ?? 0) > 0

  return !hasProduction && !hasGroundForces && !hasPlanets
}

async function eliminate(db: SupabaseClient, gameId: string, player: PlayerRow): Promise<void> {
  const playerId = player.id as string

  await db.from('game_player_units').delete().eq('player_id', playerId).eq('game_id', gameId)
  await db.from('game_system_activations').delete().eq('player_id', playerId).eq('game_id', gameId)
  await db.from('game_system_state').update({ controller_player_id: null }).eq('controller_player_id', playerId).eq('game_id', gameId)

  const { data: notes } = await db.from('game_player_promissory_notes').select('id, owner_player_id').eq('player_id', playerId).eq('game_id', gameId).in('state', ['held', 'in_play'])
  if (notes) {
    const { data: activePlayers } = await db.from('game_players').select('id').eq('game_id', gameId).eq('eliminated', false).neq('id', playerId)
    for (const note of notes) {
      const ownerPlayerId = note.owner_player_id as string
      const activeOwner = (activePlayers ?? []).find((p) => p.id === ownerPlayerId)
      if (activeOwner) {
        await db.from('game_player_promissory_notes').update({ state: 'held', held_by_player_id: ownerPlayerId }).eq('id', note.id)
      } else {
        await db.from('game_player_promissory_notes').delete().eq('id', note.id)
      }
    }
  }

  await db.from('game_player_action_cards').delete().eq('player_id', playerId).eq('game_id', gameId)
  await db.from('game_players').update({ strategy_card: null, strategy_card_2: null }).eq('id', playerId)
  await db.from('game_player_secret_objectives').update({ state: 'in_deck' }).eq('player_id', playerId).eq('game_id', gameId)

  const { data: game } = await db.from('games').select('id, speaker_player_id').eq('id', gameId).single()
  if (game && (game.speaker_player_id as string) === playerId) {
    const { data: remaining } = await db.from('game_players').select('id, seat_index').eq('game_id', gameId).eq('eliminated', false).neq('id', playerId).order('seat_index', { ascending: true })
    if (remaining && remaining.length > 0) {
      const playerSeatIndex = player.seat_index as number
      const higher = remaining.filter((p) => (p.seat_index as number) > playerSeatIndex)
      const nextSpeaker = higher.length > 0 ? higher[0] : remaining[0]
      await db.from('games').update({ speaker_player_id: nextSpeaker.id }).eq('id', gameId)
    }
  }

  const capturedFrom = player.tokens_captured_from as Record<string, number> | null
  if (capturedFrom && Object.keys(capturedFrom).length > 0) {
    for (const [ownerId, count] of Object.entries(capturedFrom)) {
      const { data: ownerPlayer } = await db.from('game_players').select('command_tokens').eq('id', ownerId).single()
      if (ownerPlayer) {
        const tokens = ownerPlayer.command_tokens as Record<string, number>
        await db.from('game_players').update({ command_tokens: { ...tokens, tactic_total: (tokens.tactic_total ?? 0) + (count as number) } }).eq('id', ownerId)
      }
    }
    await db.from('game_players').update({ tokens_captured_from: {} }).eq('id', playerId)
  }

  await db.from('game_players').update({ eliminated: true }).eq('id', playerId)
}
