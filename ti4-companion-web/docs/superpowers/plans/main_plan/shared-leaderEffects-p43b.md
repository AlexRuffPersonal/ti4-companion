# shared-leaderEffects-p43b
**File:** `supabase/functions/_shared/leaderEffects.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects

## Changes
Populate `HERO_ABILITIES` for all 24 factions. Phase 40a left this registry empty.

```pseudocode
// Add all 24 entries to HERO_ABILITIES:
'The Mahact Gene-Sorcerers':   'mahact_hero'
'The Argent Flight':           'argent_hero'      // move ships to own-token systems
'The Nekro Virus':             'nekro_hero'       // choose planet with tech specialty
'The Titans Of Ul':            'titans_hero'      // attach to Elysium, no purge
'The Vuil\'raith Cabal':       'vuil_raith_hero'  // multi-player dice roll
'The Embers Of Muaat':         'muaat_hero'       // destroy units + replace system tile
'The L1Z1X Mindnet':           [{ op:'move_flagship_and_dreadnoughts', target:'chosen_system' }]
'The Naaz-Rokha Alliance':     'naaz_rokha_hero'  // gain relic + perform 2 strategy secondaries
'The Federation Of Sol':       [{ op:'reclaim_command_tokens' }]
'The Clan Of Saar':            'saar_hero'        // destroy infantry/fighters in adjacent system
'The Barony Of Letnev':        'letnev_darktalon' // set game_round_flags.letnev_no_fleet_limit
'The Universities Of Jol-Nar': 'jol_nar_hero'    // swap non-unit-upgrade techs
'The Yin Brotherhood':         'yin_hero'         // for each planet with infantry: ready or double
'The Emirates Of Hacan':       [{ op:'produce_units_free' }]
'The Winnu':                   'winnu_mathis'
'The Nomad':                   'nomad_ahk_syl'    // set game_round_flags.nomad_flagship_ignores_tokens
'The Yssaril Tribes':          'yssaril_kyver'
'The Arborec':                 [{ op:'produce_in_systems_with_ground_forces' }]
'The Naalu Collective':        'naalu_oracle'     // force each player to give 1 promissory note
'The Xxcha Kingdom':           'xxcha_xxekir'
'The Mentak Coalition':        'mentak_hero'      // start of combat: copy destroyed enemy ships
'The Empyrean':                'empyrean_hero'    // place frontier tokens + explore
'Sardakk N\'orr':              'sardakk_hero'     // skip to commit ground forces
'The Ghosts Of Creuss':        'creuss_riftwalker'
```

## Tests
Hero activation covered via `fn-game-resolve-ability-p43b` tests.
