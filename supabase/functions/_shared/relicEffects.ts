import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { applyAbility } from './abilityDsl.ts'

export type Op = Record<string, unknown>

export const RELIC_EFFECTS: Record<string, Op[]> = {
  // ACTION relics
  'Dominus Orb':      [{ op:'dominus_orb_move' }],
  'Maw Of Worlds':    [{ op:'exhaust_planets' }, { op:'gain_technology', count:1 }],
  'Stellar Converter':[{ op:'stellar_converter' }],
  'The Codex':        [{ op:'take_from_discard', deck:'action_card', count:3 }],

  // Reactive relics
  'Scepter Of Emelpar':  [],
  'The Crown Of Thalnos':[{ op:'reroll_combat_dice' }],
  'The Obsidian':        [],
  "The Prophet's Tears": [{ op:'choose_one', options:[ [{op:'ignore_prerequisite'}], [{op:'draw_action_card',count:1}] ] }],
  'The Crown Of Emphidia':[{ op:'explore_planet', target:'any_controlled' }],
  'Shard Of The Throne': [],
}

export async function applyOnGainRelicEffect(
  relicName: string,
  gameId: string,
  playerId: string,
  db: SupabaseClient
): Promise<void> {
  const ctx = { gameId, activatingPlayerId: playerId }
  if (relicName === 'The Obsidian') {
    await applyAbility([{ op: 'draw_secret_objective' }], ctx, db)
  }
  if (relicName === 'Shard Of The Throne') {
    const { data: playerRow, error: fetchError } = await db
      .from('game_players')
      .select('vp')
      .eq('id', playerId)
      .maybeSingle()
    if (fetchError || !playerRow) throw new Error('applyOnGainRelicEffect: failed to load player')
    const { error } = await db
      .from('game_players')
      .update({ vp: (playerRow as { vp: number }).vp + 1 })
      .eq('id', playerId)
    if (error) throw new Error(`applyOnGainRelicEffect: vp update failed: ${error.message}`)
  }
}
