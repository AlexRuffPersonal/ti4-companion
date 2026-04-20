// supabase/functions/_shared/player-order.ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type PlayerOrder = 'initiative' | 'reverse_speaker'

interface PlayerRow {
  id: string
  seat_index: number | null
  created_at: string
}

export async function getNextPlayer(
  gameId: string,
  currentPlayerId: string,
  order: PlayerOrder,
  speakerPlayerId: string | null,
  db: SupabaseClient,
): Promise<string> {
  const { data: players } = await db
    .from('game_players')
    .select('id, seat_index, created_at')
    .eq('game_id', gameId)

  const rows = (players ?? []) as PlayerRow[]

  let sorted: PlayerRow[]

  if (order === 'initiative') {
    sorted = [...rows].sort((a, b) => (a.seat_index ?? 999) - (b.seat_index ?? 999))
  } else {
    // reverse_speaker: sort by join order, rearrange so speaker is last
    const byJoin = [...rows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const speakerIdx = byJoin.findIndex(p => p.id === speakerPlayerId)
    // Order starting from player after speaker, speaker is last
    sorted = [
      ...byJoin.slice(speakerIdx + 1),
      ...byJoin.slice(0, speakerIdx + 1),
    ]
  }

  const currentIdx = sorted.findIndex(p => p.id === currentPlayerId)
  const nextIdx = (currentIdx + 1) % sorted.length
  return sorted[nextIdx].id
}