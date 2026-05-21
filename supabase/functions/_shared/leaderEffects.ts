import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ResolveContext } from './abilityDsl.ts'

// DSL Op type (simplified — full type is in abilityDsl.ts)
export type Op = Record<string, unknown>

export type CommanderTrigger =
  | 'PRODUCTION'
  | 'TECH_RESEARCHED'
  | 'SUSTAIN_DAMAGE'
  | 'GROUND_COMBAT_START'
  | 'COMBAT_ROLL'
  | 'UNIT_ABILITY_ROLL'
  | 'BOMBARDMENT'
  | 'SYSTEM_ACTIVATED'
  | 'SHIPS_MOVED'
  | 'PLANET_CONTROL_GAINED'
  | 'STRATEGY_TOKEN_SPENT'
  | 'CAST_VOTES'

export interface CommanderPassive {
  trigger: CommanderTrigger
  mode: 'inline' | 'window'
  condition?: string
  effect: Op[] | string
  targetPlayer?: 'self' | 'activating' | 'any'
}

// Phase 40a: agent abilities — all 24 factions
// Simple effects use Op[]; complex abilities use a string handler key
export const AGENT_ABILITIES: Record<string, Op[] | string> = {
  'The Titans Of Ul':            [{ op: 'cancel_hit', target: 'either' }],
  'The Emirates Of Hacan':       [{ op: 'choice', options: [
    [{ op: 'gain_commodities', amount: 2, target: 'self' }],
    [{ op: 'replenish_commodities', target: 'chosen_player' }],
  ] }],
  'The Yssaril Tribes':          'ssruu_copies_agents',
  'The Federation Of Sol':       [{ op: 'place_units', unit_type: 'infantry', count: 2, target: 'active_planet' }],
  'The Arborec':                 [{ op: 'produce_units', count: 2, in_system: 'any_with_production' }],
  'The L1Z1X Mindnet':           [{ op: 'cancel_hit', target: 'friendly' }],
  'The Naalu Collective':        [{ op: 'swap_combat_cards', target: 'chosen_player' }],
  'The Xxcha Kingdom':           'xxcha_peace_accords',
  'The Yin Brotherhood':         [{ op: 'place_units', unit_type: 'fighter', count: 3, target: 'active_system' }],
  'The Winnu':                   [{ op: 'gain_trade_goods', amount: 3 }],
  'The Nekro Virus':             [{ op: 'place_units', unit_type: 'destroyer', count: 2, target: 'active_system' }],
  'The Mentak Coalition':        'mentak_pillage',
  'The Clan Of Saar':            [{ op: 'move_units_to_space', target: 'active_planet' }],
  'The Universities Of Jol-Nar': [{ op: 'draw_action_card', count: 2 }],
  'The Barony Of Letnev':        [{ op: 'choice', options: [
    [{ op: 'gain_trade_goods', amount: 3 }],
    [{ op: 'cancel_hit', target: 'friendly' }],
  ] }],
  'The Embers Of Muaat':         [{ op: 'place_units', unit_type: 'fighter', count: 3, target: 'active_system' }],
  'The Ghosts Of Creuss':        'creuss_quantum_entanglement',
  'The Mahact Gene-Sorcerers':   'mahact_imperia',
  'The Nomad':                   [{ op: 'produce_units', count: 3, in_system: 'any_with_production' }],
  'The Vuil\'raith Cabal':       'vuilraith_seeker_drones',
  'The Argent Flight':           [{ op: 'gain_commodities', amount: 3, target: 'self' }],
  'The Empyrean':                [{ op: 'retreat_ships', target: 'chosen_player' }],
  'The Naaz-Rokha Alliance':     [{ op: 'produce_units', count: 2, in_system: 'any_with_production' }],
  'Sardakk N\'orr':              [{ op: 'cancel_hit', target: 'friendly' }],
}

// Phase 40b: hero abilities — all 24 factions
export const HERO_ABILITIES: Record<string, Op[] | string> = {
  'The Federation Of Sol':       [{ op: 'reclaim_command_tokens' }],
  'The Arborec':                 [{ op: 'produce_in_systems_with_ground_forces' }],
  'The Emirates Of Hacan':       [{ op: 'produce_units_free' }],
  'The Ghosts Of Creuss':        'creuss_riftwalker',
  'The Mahact Gene-Sorcerers':   'mahact_hero',
  'The Winnu':                   'winnu_mathis',
  'The L1Z1X Mindnet':           'l1z1x_cybernetic_enhancements',
  'The Naalu Collective':        'naalu_gift_of_prescience',
  'The Xxcha Kingdom':           'xxcha_quash',
  'The Yin Brotherhood':         'yin_benediction',
  'The Nekro Virus':             'nekro_hero',
  'The Mentak Coalition':        'mentak_hero',
  'The Clan Of Saar':            'saar_gurno_aggression',
  'The Universities Of Jol-Nar': 'jol_nar_hero',
  'The Barony Of Letnev':        'letnev_hero',
  'The Embers Of Muaat':         'muaat_hero',
  'The Titans Of Ul':            'titans_hero',
  'The Nomad':                   'nomad_hero',
  'The Vuil\'raith Cabal':       'vuilraith_hero',
  'The Argent Flight':           'argent_hero',
  'The Empyrean':                'empyrean_hero',
  'The Naaz-Rokha Alliance':     'naaz_rokha_hero',
  'Sardakk N\'orr':              'sardakk_hero',
  'The Yssaril Tribes':          'yssaril_hero',
}

// Phase 40c: commander passives — populated in Phase 43c (shared-leaderEffects-p43c)
export const COMMANDER_PASSIVES: Record<string, CommanderPassive[]> = {}

// Phase 40a: which agents fire as reactive windows when another player acts
export const AGENT_REACTIVE_TRIGGERS: Record<string, CommanderTrigger[]> = {
  'The Ghosts Of Creuss':  ['SYSTEM_ACTIVATED'],
  'The Arborec':           ['SYSTEM_ACTIVATED'],
  'The Empyrean':          ['SHIPS_MOVED'],
  'The Barony Of Letnev':  ['GROUND_COMBAT_START'],
  'The Federation Of Sol': ['GROUND_COMBAT_START'],
  'The Yssaril Tribes':    ['SYSTEM_ACTIVATED'],
}

export interface PendingWindow {
  game_id: string
  trigger: CommanderTrigger
  faction: string
  player_id: string
  effect: Op[] | string
  condition?: string
}

export interface ApplyCommanderPassivesResult {
  inlineEffects: unknown[]
  pendingWindows: PendingWindow[]
}

/**
 * Check all unlocked commanders and apply matching passive effects.
 * Inline effects are applied immediately; window effects are queued as pending_windows.
 */
export async function applyCommanderPassives(
  trigger: CommanderTrigger,
  context: ResolveContext & { faction: string; systemKey?: string },
  db: SupabaseClient,
): Promise<ApplyCommanderPassivesResult> {
  const inlineEffects: unknown[] = []
  const pendingWindows: PendingWindow[] = []

  const { data: players } = await db
    .from('game_players')
    .select('id, faction, leaders')
    .eq('game_id', context.gameId)

  for (const player of (players ?? [])) {
    const p = player as Record<string, unknown>
    const leaders = (p.leaders ?? {}) as Record<string, string>
    if (leaders.commander !== 'unlocked') continue

    const faction = p.faction as string
    const passives = COMMANDER_PASSIVES[faction]
    if (!passives) continue

    for (const passive of passives) {
      if (passive.trigger !== trigger) continue

      if (passive.mode === 'inline') {
        inlineEffects.push({ faction, effect: passive.effect, condition: passive.condition })
      } else {
        pendingWindows.push({
          game_id: context.gameId,
          trigger,
          faction,
          player_id: p.id as string,
          effect: passive.effect,
          condition: passive.condition,
        })
      }
    }
  }

  return { inlineEffects, pendingWindows }
}
