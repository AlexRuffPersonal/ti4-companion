import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface NoteEntry {
  instanceId: string
  holderPlayerId: string
  ownerPlayerId: string
}

export interface ActiveNotes {
  supportForThrone: NoteEntry[]
  alliance: NoteEntry[]
  tradeConvoys: NoteEntry[]
  promiseOfProtection: NoteEntry[]
  bloodPact: NoteEntry[]
  darkPact: NoteEntry[]
  stymie: NoteEntry[]
  antivirus: NoteEntry[]
  giftOfPrescience: NoteEntry[]
}

/**
 * Maps a promissory note name to its camelCase key in ActiveNotes.
 * Unknown names are ignored.
 */
function nameToKey(name: string): keyof ActiveNotes | null {
  const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim()
  if (normalized === 'support for the throne') return 'supportForThrone'
  if (normalized === 'alliance') return 'alliance'
  if (normalized === 'trade convoys') return 'tradeConvoys'
  if (normalized === 'promise of protection') return 'promiseOfProtection'
  if (normalized === 'blood pact') return 'bloodPact'
  if (normalized === 'dark pact') return 'darkPact'
  if (normalized === 'stymie') return 'stymie'
  if (normalized === 'antivirus') return 'antivirus'
  if (normalized === 'gift of prescience') return 'giftOfPrescience'
  return null
}

/**
 * Returns all promissory notes currently in play (state='in_play') for the game,
 * grouped into ActiveNotes by note name.
 */
export async function getActiveNotes(gameId: string, db: SupabaseClient): Promise<ActiveNotes> {
  const result: ActiveNotes = {
    supportForThrone: [],
    alliance: [],
    tradeConvoys: [],
    promiseOfProtection: [],
    bloodPact: [],
    darkPact: [],
    stymie: [],
    antivirus: [],
    giftOfPrescience: [],
  }

  const { data, error } = await db
    .from('game_player_promissory_notes')
    .select('id, held_by_player_id, owner_player_id, promissory_notes(name)')
    .eq('game_id', gameId)
    .eq('state', 'in_play')

  if (error) throw new Error(`Failed to load active notes: ${error.message}`)
  if (!data) return result

  for (const row of data) {
    const name = (row.promissory_notes as { name: string } | null)?.name ?? ''
    const key = nameToKey(name)
    if (!key) continue
    result[key].push({
      instanceId: row.id as string,
      holderPlayerId: row.held_by_player_id as string,
      ownerPlayerId: row.owner_player_id as string,
    })
  }

  return result
}

/**
 * Returns a played promissory note to its owner's hand.
 */
export async function returnNote(
  instanceId: string,
  ownerPlayerId: string,
  db: SupabaseClient
): Promise<void> {
  const { error } = await db
    .from('game_player_promissory_notes')
    .update({ state: 'held', held_by_player_id: ownerPlayerId })
    .eq('id', instanceId)

  if (error) throw new Error(`Failed to return note: ${error.message}`)
}
