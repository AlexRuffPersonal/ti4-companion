import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ResolveContext } from './abilityDsl.ts'

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
    if (elysiumError) throw Object.assign(new Error('Database error'), { status: 500 })
    if (!elysiumRow) throw Object.assign(new Error('Elysium not controlled'), { status: 409 })

    const { data: attachRow } = await db
      .from('attachments')
      .select('id')
      .eq('name', 'Geoform')
      .maybeSingle()
    if (!attachRow) throw Object.assign(new Error('Geoform attachment not found'), { status: 409 })

    const er = elysiumRow as Record<string, unknown>
    const currentAttachments = (er.attachments as string[]) ?? []
    if (currentAttachments.includes((attachRow as Record<string, string>).id)) {
      throw Object.assign(new Error('Already attached'), { status: 409 })
    }

    const { error: attachError } = await db
      .from('game_player_planets')
      .update({ attachments: [...currentAttachments, (attachRow as Record<string, string>).id] })
      .eq('id', er.id as string)
    if (attachError) throw Object.assign(new Error('Database error'), { status: 500 })

    const { error: readyError } = await db
      .from('game_player_planets')
      .update({ exhausted: false })
      .eq('game_id', gameId)
      .eq('player_id', activatingPlayerId)
      .eq('planet_name', 'Elysium')
    if (readyError) throw Object.assign(new Error('Database error'), { status: 500 })

    const { data: playerRow, error: playerError } = await db
      .from('game_players')
      .select('leaders')
      .eq('id', activatingPlayerId)
      .maybeSingle()
    if (playerError || !playerRow) throw Object.assign(new Error('Player not found'), { status: 500 })

    const leaders = ((playerRow as Record<string, unknown>).leaders as Record<string, string>) ?? {}
    const { error: leadersError } = await db
      .from('game_players')
      .update({ leaders: { ...leaders, hero: 'attached' } })
      .eq('id', activatingPlayerId)
    if (leadersError) throw Object.assign(new Error('Database error'), { status: 500 })
  },
}

export function getHandler(name: string): HandlerFn {
  const handler = handlers[name]
  if (!handler) throw new Error(`No handler registered for: ${name}`)
  return handler
}
