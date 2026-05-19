# shared-leaderEffects-p43c
**File:** `supabase/functions/_shared/leaderEffects.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects

## Changes
Populate `COMMANDER_PASSIVES` for all 24 factions (Phase 43a/43b left this registry empty).

```pseudocode
COMMANDER_PASSIVES = {
  'The Mahact Gene-Sorcerers': [{
    trigger: 'SYSTEM_ACTIVATED', mode: 'inline',
    condition: 'activating player is Mahact with own token in system',
    effect: 'mahact_il_na_viroset'  // skip ERR, return both tokens
  }],
  'The Argent Flight': [{
    trigger: 'UNIT_ABILITY_ROLL', mode: 'window', targetPlayer: 'self',
    condition: 'one or more of your units rolling for unit ability',
    effect: [{ op: 'add_die', target: 'chosen_unit' }]
  }],
  'The Nekro Virus': [{
    trigger: 'TECH_RESEARCHED', mode: 'window', targetPlayer: 'self',
    effect: [{ op: 'draw_action_card' }]
  }],
  'The Titans Of Ul': [{
    trigger: 'PRODUCTION', mode: 'window', targetPlayer: 'self',
    effect: [{ op: 'gain_trade_goods', amount: 1 }]
  }],
  'The Vuil\'raith Cabal': [{
    trigger: 'PRODUCTION', mode: 'inline', targetPlayer: 'self',
    condition: 'fighter or infantry produced',
    effect: 'vuil_production_limit_bypass'  // up to 2 fighters/infantry skip limit
  }],
  'The Embers Of Muaat': [{
    trigger: 'STRATEGY_TOKEN_SPENT', mode: 'window', targetPlayer: 'self',
    effect: [{ op: 'gain_trade_goods', amount: 1 }]
  }],
  'The L1Z1X Mindnet': [{
    trigger: 'BOMBARDMENT', mode: 'inline',
    effect: 'l1z1x_skip_planetary_shield'
  }],
  'The Naaz-Rokha Alliance': [{
    trigger: 'PLANET_CONTROL_GAINED', mode: 'window', targetPlayer: 'self',
    effect: [{ op: 'explore_planet_free' }]
  }],
  'The Federation Of Sol': [{
    trigger: 'GROUND_COMBAT_START', mode: 'window', targetPlayer: 'self',
    condition: 'ground combat on planet you control',
    effect: [{ op: 'place_units', unit_type: 'infantry', count: 1, target: 'active_planet' }]
  }],
  'The Clan Of Saar': [{
    trigger: 'PRODUCTION', mode: 'window', targetPlayer: 'self',
    condition: 'producing fighters or infantry',
    effect: [{ op: 'produce_at_any_space_dock' }]
  }],
  'The Barony Of Letnev': [{
    trigger: 'SUSTAIN_DAMAGE', mode: 'window', targetPlayer: 'self',
    effect: [{ op: 'gain_trade_goods', amount: 1 }]
  }],
  'The Universities Of Jol-Nar': [{
    trigger: 'UNIT_ABILITY_ROLL', mode: 'window', targetPlayer: 'self',
    effect: 'jol_nar_reroll_window'  // opens commander_reroll pending window
  }],
  'The Yin Brotherhood': [{
    trigger: 'TECH_RESEARCHED', mode: 'inline',
    effect: 'yin_omar_passive'  // prerequisite bypass + extra infantry in production
  }],
  'The Emirates Of Hacan': [{
    trigger: 'CAST_VOTES', mode: 'inline', targetPlayer: 'self',
    effect: 'hacan_trade_good_votes'
  }],
  'The Winnu': [{
    trigger: 'COMBAT_ROLL', mode: 'inline', targetPlayer: 'self',
    condition: 'system is Mecatol Rex, Winnu home, or contains legendary planet',
    effect: 'winnu_combat_bonus'
  }],
  'The Nomad': [{
    trigger: 'PRODUCTION', mode: 'inline', targetPlayer: 'self',
    condition: 'producing flagship',
    effect: 'nomad_free_flagship'
  }],
  'The Yssaril Tribes': [{
    trigger: 'SYSTEM_ACTIVATED', mode: 'window', targetPlayer: 'activating',
    condition: 'activated system contains your units',
    effect: 'yssaril_peek_window'  // pending window for hand peek
  }],
  'The Arborec': [{
    trigger: 'SYSTEM_ACTIVATED', mode: 'window', targetPlayer: 'any',
    condition: 'system contains Arborec production unit',
    effect: [{ op: 'produce_units', count: 1, in_system: 'active' }]
  }],
  'The Naalu Collective': [{
    trigger: 'PRODUCTION', mode: 'inline', targetPlayer: 'self',
    condition: 'producing fighters',
    effect: 'naalu_extra_fighter'  // 1 additional fighter past production limit
  }],
  'The Xxcha Kingdom': [{
    trigger: 'CAST_VOTES', mode: 'inline', targetPlayer: 'self',
    effect: 'xxcha_extra_vote_per_planet'
  }],
  'The Mentak Coalition': [{
    trigger: 'SYSTEM_ACTIVATED', mode: 'window', targetPlayer: 'self',
    condition: 'won space combat in system',
    effect: [{ op: 'give_promissory_to_opponent' }]
  }],
  'The Empyrean': [{
    trigger: 'SHIPS_MOVED', mode: 'window', targetPlayer: 'any',
    condition: 'player moved ships into system containing your command token',
    effect: 'empyrean_return_token'
  }],
  'Sardakk N\'orr': [{
    trigger: 'GROUND_COMBAT_START', mode: 'inline', targetPlayer: 'self',
    effect: 'sardakk_extended_commitment'
  }],
  'The Ghosts Of Creuss': [{
    trigger: 'SHIPS_MOVED', mode: 'window', targetPlayer: 'self',
    condition: 'ship with capacity moved through wormhole, unused capacity in active system',
    effect: [{ op: 'place_units', unit_type: 'fighter', count: 1, target: 'active_system' }]
  }],
}
```

## Tests
Covered via integration tests in each consuming Edge Function test file.
