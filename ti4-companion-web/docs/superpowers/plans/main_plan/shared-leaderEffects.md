# shared-leaderEffects
**File:** `supabase/functions/_shared/leaderEffects.ts`
**Status:** New
**Prereqs:** migration-052-leader-abilities

## Functionality
```pseudocode
export type CommanderTrigger =
  'PRODUCTION' | 'TECH_RESEARCHED' | 'SUSTAIN_DAMAGE' | 'GROUND_COMBAT_START'
  | 'COMBAT_ROLL' | 'UNIT_ABILITY_ROLL' | 'BOMBARDMENT' | 'SYSTEM_ACTIVATED'
  | 'SHIPS_MOVED' | 'PLANET_CONTROL_GAINED' | 'STRATEGY_TOKEN_SPENT' | 'CAST_VOTES'

export interface CommanderPassive {
  trigger: CommanderTrigger
  mode: 'inline' | 'window'
  condition?: string
  effect: Op[] | string         // Op[] = DSL ops; string = abilityHandlers.ts key
  targetPlayer?: 'self' | 'activating' | 'any'
}

// Phase 40a: agents only
export const AGENT_ABILITIES: Record<string, Op[] | string> = {
  // All 24 faction agents defined here (see design doc Section 2 for representative samples)
  // Simple effects use Op[]; complex abilities use a string handler key
  'The Titans Of Ul':           [{ op:'cancel_hit', target:'either' }],
  'The Emirates Of Hacan':      [{ op:'choice', options:[
    [{ op:'gain_commodities', amount:2, target:'self' }],
    [{ op:'replenish_commodities', target:'chosen_player' }]
  ]}],
  'The Yssaril Tribes':         'ssruu_copies_agents',
  // ... all 24 agents
}

// Phase 40b: heroes
export const HERO_ABILITIES: Record<string, Op[] | string> = {
  'The Federation Of Sol':       [{ op:'reclaim_command_tokens' }],
  'The Arborec':                 [{ op:'produce_in_systems_with_ground_forces' }],
  'The Emirates Of Hacan':       [{ op:'produce_units_free' }],
  'The Ghosts Of Creuss':        'creuss_riftwalker',
  'The Mahact Gene-Sorcerers':   'mahact_hero',
  'The Winnu':                   'winnu_mathis',
  // ... all 24 heroes
}

// Phase 40c: commander passives
export const COMMANDER_PASSIVES: Record<string, CommanderPassive[]> = {
  'The L1Z1X Mindnet':    [{ trigger:'BOMBARDMENT',      mode:'inline', effect:'l1z1x_skip_planetary_shield' }],
  'The Titans Of Ul':     [{ trigger:'PRODUCTION',       mode:'window', targetPlayer:'self', effect:[{ op:'gain_trade_goods', amount:1 }] }],
  'The Arborec':          [{ trigger:'SYSTEM_ACTIVATED', mode:'window', targetPlayer:'any',  condition:'system contains Arborec production unit', effect:[{ op:'produce_units', count:1, in_system:'active' }] }],
  // ... all 24 commanders
}

// Phase 40a: which agents fire as reactive windows when another player acts
export const AGENT_REACTIVE_TRIGGERS: Record<string, CommanderTrigger[]> = {
  'The Ghosts Of Creuss':   ['SYSTEM_ACTIVATED'],
  'The Arborec':            ['SYSTEM_ACTIVATED'],
  'The Empyrean':           ['SHIPS_MOVED'],
  'The Barony Of Letnev':   ['GROUND_COMBAT_START'],
  'The Federation Of Sol':  ['GROUND_COMBAT_START'],
  'The Yssaril Tribes':     ['SYSTEM_ACTIVATED'],
  // ... all reactive agents
}

export function applyCommanderPassives(
  trigger: CommanderTrigger,
  context: ResolveContext & { faction: string; systemKey?: string },
  db: SupabaseClient
): Promise<{ inlineEffects: unknown[]; pendingWindows: unknown[] }>
  // check all game_players WHERE leaders.commander='unlocked'
  // for each unlocked commander whose COMMANDER_PASSIVES[faction] has trigger match:
  //   if mode='inline': apply effect immediately, push to inlineEffects
  //   if mode='window': push pending_window entry
```

## Tests
Covered via integration tests in each consuming Edge Function's test file.
Unit tests for `applyCommanderPassives` dispatch logic in `tests/lib/leaderEffects.test.js`.
