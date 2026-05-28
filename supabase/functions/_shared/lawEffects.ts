import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export class LawError extends Error {
  status: number
  constructor(message: string, status = 409) {
    super(message)
    this.name = 'LawError'
    this.status = status
  }
}

interface ActiveLaw {
  law_id: string
  name: string
  elected_target: string | null
}

export async function getActiveLaws(db: SupabaseClient, gameId: string): Promise<ActiveLaw[]> {
  const { data, error } = await db
    .from('game_laws')
    .select('id, elected_target, agendas!inner(name)')
    .eq('game_id', gameId)
    .eq('is_repealed', false)

  if (error) throw new Error(`getActiveLaws: failed to fetch laws: ${error.message}`)

  return (data ?? []).map((row: Record<string, unknown>) => ({
    law_id: row.id as string,
    name: (row.agendas as { name: string }).name,
    elected_target: row.elected_target as string | null,
  }))
}

export async function assertProductionAllowed(
  db: SupabaseClient,
  gameId: string,
  unitType: string
): Promise<void> {
  const laws = await getActiveLaws(db, gameId)

  if (laws.find(l => l.name === 'Regulated Conscription') && unitType !== 'infantry') {
    throw new LawError('Regulated Conscription: only infantry may be produced', 409)
  }

  if (laws.find(l => l.name === 'Articles of War') && unitType === 'pds') {
    throw new LawError('Articles of War: PDS cannot be produced', 409)
  }
}

export async function assertMovementAllowed(
  db: SupabaseClient,
  gameId: string,
  planetName: string
): Promise<void> {
  const laws = await getActiveLaws(db, gameId)
  const dmz = laws.find(l => l.name === 'Demilitarized Zone')

  if (dmz && dmz.elected_target === planetName) {
    throw new LawError('Demilitarized Zone: units cannot enter this planet', 409)
  }
}

export async function assertFleetCapacity(
  db: SupabaseClient,
  gameId: string,
  playerId: string,
  requestedFleetSize: number
): Promise<void> {
  const laws = await getActiveLaws(db, gameId)

  if (!laws.find(l => l.name === 'Fleet Regulations')) return

  const { data: playerRow, error } = await db
    .from('game_players')
    .select('command_tokens')
    .eq('id', playerId)
    .maybeSingle()

  if (error || !playerRow) throw new Error('assertFleetCapacity: failed to load player')

  const fleetMax = (playerRow as { command_tokens: { fleet: number } }).command_tokens.fleet

  if (requestedFleetSize > Math.max(0, fleetMax - 2)) {
    throw new LawError('Fleet Regulations: fleet size exceeds reduced maximum', 409)
  }
}

export async function assertCombatHitAllowed(
  db: SupabaseClient,
  gameId: string,
  unitType: string
): Promise<void> {
  const laws = await getActiveLaws(db, gameId)

  if (laws.find(l => l.name === 'Conventions of War') && unitType === 'fighter') {
    throw new LawError('Conventions of War: fighters cannot be destroyed', 409)
  }
}

export async function applyStatusPhaseLaws(
  db: SupabaseClient,
  gameId: string,
  playerUpdates: { playerId: string; tokenGain: number }[]
): Promise<{ playerId: string; tokenGain: number }[]> {
  const laws = await getActiveLaws(db, gameId)

  if (!laws.find(l => l.name === 'Executive Sanctions')) return playerUpdates

  return playerUpdates.map(p => ({ ...p, tokenGain: Math.min(p.tokenGain, 3) }))
}

const VP_MAINTENANCE_LAWS = ['Holy Planet of Ixth', 'Shard of the Throne', 'Crown of Emphidia']

export async function checkVpMaintenanceLaws(
  db: SupabaseClient,
  gameId: string,
  previousOwnerId: string,
  lostPlanetName: string
): Promise<void> {
  const laws = await getActiveLaws(db, gameId)

  const matchingLaws = laws.filter(
    l => VP_MAINTENANCE_LAWS.includes(l.name) && l.elected_target === lostPlanetName
  )

  if (matchingLaws.length === 0) return

  const { data: playerRow, error } = await db
    .from('game_players')
    .select('vp')
    .eq('id', previousOwnerId)
    .maybeSingle()

  if (error || !playerRow) throw new Error('checkVpMaintenanceLaws: failed to load player')

  const vp = (playerRow as { vp: number }).vp
  if (vp > 0) {
    const { error: updateError } = await db
      .from('game_players')
      .update({ vp: vp - 1 })
      .eq('id', previousOwnerId)
    if (updateError) throw new Error(`checkVpMaintenanceLaws: vp update failed: ${updateError.message}`)
  }
}
