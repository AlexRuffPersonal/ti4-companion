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
  'The Mahact Gene-Sorcerers':   'mahact_hero',
  'The Argent Flight':           'argent_hero',
  'The Nekro Virus':             'nekro_hero',
  'The Titans Of Ul':            'titans_hero',
  "The Vuil'raith Cabal":        'vuil_raith_hero',
  'The Embers Of Muaat':         'muaat_hero',
  'The L1Z1X Mindnet':           [{ op: 'move_flagship_and_dreadnoughts', target: 'chosen_system' }],
  'The Naaz-Rokha Alliance':     'naaz_rokha_hero',
  'The Federation Of Sol':       [{ op: 'reclaim_command_tokens' }],
  'The Clan Of Saar':            'saar_hero',
  'The Barony Of Letnev':        'letnev_darktalon',
  'The Universities Of Jol-Nar': 'jol_nar_hero',
  'The Yin Brotherhood':         'yin_hero',
  'The Emirates Of Hacan':       [{ op: 'produce_units_free' }],
  'The Winnu':                   'winnu_mathis',
  'The Nomad':                   'nomad_ahk_syl',
  'The Yssaril Tribes':          'yssaril_kyver',
  'The Arborec':                 [{ op: 'produce_in_systems_with_ground_forces' }],
  'The Naalu Collective':        'naalu_oracle',
  'The Xxcha Kingdom':           'xxcha_xxekir',
  'The Mentak Coalition':        'mentak_hero',
  'The Empyrean':                'empyrean_hero',
  "Sardakk N'orr":               'sardakk_hero',
  'The Ghosts Of Creuss':        'creuss_riftwalker',
}

// Phase 40c / 43c: commander passives — all 24 factions
export const COMMANDER_PASSIVES: Record<string, CommanderPassive[]> = {
  'The Mahact Gene-Sorcerers': [{
    trigger: 'SYSTEM_ACTIVATED',
    mode: 'inline',
    condition: 'activating player is Mahact with own token in system',
    effect: 'mahact_il_na_viroset',
  }],
  'The Argent Flight': [{
    trigger: 'UNIT_ABILITY_ROLL',
    mode: 'window',
    targetPlayer: 'self',
    condition: 'one or more of your units rolling for unit ability',
    effect: [{ op: 'add_die', target: 'chosen_unit' }],
  }],
  'The Nekro Virus': [{
    trigger: 'TECH_RESEARCHED',
    mode: 'window',
    targetPlayer: 'self',
    effect: [{ op: 'draw_action_card' }],
  }],
  'The Titans Of Ul': [{
    trigger: 'PRODUCTION',
    mode: 'window',
    targetPlayer: 'self',
    effect: [{ op: 'gain_trade_goods', amount: 1 }],
  }],
  "The Vuil'raith Cabal": [{
    trigger: 'PRODUCTION',
    mode: 'inline',
    targetPlayer: 'self',
    condition: 'fighter or infantry produced',
    effect: 'vuil_production_limit_bypass',
  }],
  'The Embers Of Muaat': [{
    trigger: 'STRATEGY_TOKEN_SPENT',
    mode: 'window',
    targetPlayer: 'self',
    effect: [{ op: 'gain_trade_goods', amount: 1 }],
  }],
  'The L1Z1X Mindnet': [{
    trigger: 'BOMBARDMENT',
    mode: 'inline',
    effect: 'l1z1x_skip_planetary_shield',
  }],
  'The Naaz-Rokha Alliance': [{
    trigger: 'PLANET_CONTROL_GAINED',
    mode: 'window',
    targetPlayer: 'self',
    effect: [{ op: 'explore_planet_free' }],
  }],
  'The Federation Of Sol': [{
    trigger: 'GROUND_COMBAT_START',
    mode: 'window',
    targetPlayer: 'self',
    condition: 'ground combat on planet you control',
    effect: [{ op: 'place_units', unit_type: 'infantry', count: 1, target: 'active_planet' }],
  }],
  'The Clan Of Saar': [{
    trigger: 'PRODUCTION',
    mode: 'window',
    targetPlayer: 'self',
    condition: 'producing fighters or infantry',
    effect: [{ op: 'produce_at_any_space_dock' }],
  }],
  'The Barony Of Letnev': [{
    trigger: 'SUSTAIN_DAMAGE',
    mode: 'window',
    targetPlayer: 'self',
    effect: [{ op: 'gain_trade_goods', amount: 1 }],
  }],
  'The Universities Of Jol-Nar': [{
    trigger: 'UNIT_ABILITY_ROLL',
    mode: 'window',
    targetPlayer: 'self',
    effect: 'jol_nar_reroll_window',
  }],
  'The Yin Brotherhood': [{
    trigger: 'TECH_RESEARCHED',
    mode: 'inline',
    effect: 'yin_omar_passive',
  }],
  'The Emirates Of Hacan': [{
    trigger: 'CAST_VOTES',
    mode: 'inline',
    targetPlayer: 'self',
    effect: 'hacan_trade_good_votes',
  }],
  'The Winnu': [{
    trigger: 'COMBAT_ROLL',
    mode: 'inline',
    targetPlayer: 'self',
    condition: 'system is Mecatol Rex, Winnu home, or contains legendary planet',
    effect: 'winnu_combat_bonus',
  }],
  'The Nomad': [{
    trigger: 'PRODUCTION',
    mode: 'inline',
    targetPlayer: 'self',
    condition: 'producing flagship',
    effect: 'nomad_free_flagship',
  }],
  'The Yssaril Tribes': [{
    trigger: 'SYSTEM_ACTIVATED',
    mode: 'window',
    targetPlayer: 'activating',
    condition: 'activated system contains your units',
    effect: 'yssaril_peek_window',
  }],
  'The Arborec': [{
    trigger: 'SYSTEM_ACTIVATED',
    mode: 'window',
    targetPlayer: 'any',
    condition: 'system contains Arborec production unit',
    effect: [{ op: 'produce_units', count: 1, in_system: 'active' }],
  }],
  'The Naalu Collective': [{
    trigger: 'PRODUCTION',
    mode: 'inline',
    targetPlayer: 'self',
    condition: 'producing fighters',
    effect: 'naalu_extra_fighter',
  }],
  'The Xxcha Kingdom': [{
    trigger: 'CAST_VOTES',
    mode: 'inline',
    targetPlayer: 'self',
    effect: 'xxcha_extra_vote_per_planet',
  }],
  'The Mentak Coalition': [{
    trigger: 'SYSTEM_ACTIVATED',
    mode: 'window',
    targetPlayer: 'self',
    condition: 'won space combat in system',
    effect: [{ op: 'give_promissory_to_opponent' }],
  }],
  'The Empyrean': [{
    trigger: 'SHIPS_MOVED',
    mode: 'window',
    targetPlayer: 'any',
    condition: 'player moved ships into system containing your command token',
    effect: 'empyrean_return_token',
  }],
  "Sardakk N'orr": [{
    trigger: 'GROUND_COMBAT_START',
    mode: 'inline',
    targetPlayer: 'self',
    effect: 'sardakk_extended_commitment',
  }],
  'The Ghosts Of Creuss': [{
    trigger: 'SHIPS_MOVED',
    mode: 'window',
    targetPlayer: 'self',
    condition: 'ship with capacity moved through wormhole, unused capacity in active system',
    effect: [{ op: 'place_units', unit_type: 'fighter', count: 1, target: 'active_system' }],
  }],
}

// Phase 40a: which agents fire as reactive windows when another player acts
export const AGENT_REACTIVE_TRIGGERS: Record<string, CommanderTrigger[]> = {
  'The Ghosts Of Creuss':  ['SYSTEM_ACTIVATED'],
  'The Arborec':           ['SYSTEM_ACTIVATED'],
  'The Empyrean':          ['SHIPS_MOVED'],
  'The Barony Of Letnev':  ['GROUND_COMBAT_START'],
  'The Federation Of Sol': ['GROUND_COMBAT_START'],
  'The Yssaril Tribes':    ['SYSTEM_ACTIVATED'],
  'The Winnu':             ['PRODUCTION'],
  'The Titans Of Ul':      ['SUSTAIN_DAMAGE'],
}

export function collectReactiveAgents(
  players: Record<string, unknown>[],
  trigger: CommanderTrigger,
  excludeId: string,
): { player_id: string; faction: string }[] {
  return players
    .filter(p => (p.id as string) !== excludeId && (p.leaders as Record<string, string> | null)?.agent === 'unlocked')
    .filter(p => AGENT_REACTIVE_TRIGGERS[p.faction as string]?.includes(trigger))
    .map(p => ({ player_id: p.id as string, faction: p.faction as string }))
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
