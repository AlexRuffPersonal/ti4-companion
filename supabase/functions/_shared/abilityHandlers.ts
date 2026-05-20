import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ResolveContext } from './abilityDsl.ts'
import { dslError } from './abilityDsl.ts'

type HandlerFn = (context: ResolveContext, db: SupabaseClient) => Promise<void>

const handlers: Record<string, HandlerFn> = {
  ul_progenitor_hero: async (context, db) => {
    const { gameId, activatingPlayerId } = context

    const { data: elysiumRow, error: elysiumError } = await db
      .from('game_player_planets')
      .select('id, attachments')
      .eq('game_id', gameId)
      .eq('player_id', activatingPlayerId)
      .eq('planet_name', 'Elysium')
      .maybeSingle()
    if (elysiumError) throw dslError('Database error', 500)
    if (!elysiumRow) throw dslError('Elysium not controlled')

    const { data: attachRow, error: geoformError } = await db
      .from('attachments')
      .select('id')
      .eq('name', 'Geoform')
      .maybeSingle()
    if (geoformError) throw dslError('Database error', 500)
    if (!attachRow) throw dslError('Geoform attachment not found')

    const er = elysiumRow as Record<string, unknown>
    const currentAttachments = (er.attachments as string[]) ?? []
    if (currentAttachments.includes((attachRow as Record<string, string>).id)) {
      throw dslError('Already attached')
    }

    const { error: updateError } = await db
      .from('game_player_planets')
      .update({
        attachments: [...currentAttachments, (attachRow as Record<string, string>).id],
        exhausted: false,
      })
      .eq('id', er.id as string)
    if (updateError) throw dslError('Database error', 500)

    const { data: playerRow, error: playerError } = await db
      .from('game_players')
      .select('leaders')
      .eq('id', activatingPlayerId)
      .maybeSingle()
    if (playerError || !playerRow) throw dslError('Player not found', 500)

    const leaders = ((playerRow as Record<string, unknown>).leaders as Record<string, string>) ?? {}
    const { error: leadersError } = await db
      .from('game_players')
      .update({ leaders: { ...leaders, hero: 'attached' } })
      .eq('id', activatingPlayerId)
    if (leadersError) throw dslError('Database error', 500)
  },
}

export function getHandler(name: string): HandlerFn {
  const handler = handlers[name]
  if (!handler) throw new Error(`No handler registered for: ${name}`)
  return handler
}
