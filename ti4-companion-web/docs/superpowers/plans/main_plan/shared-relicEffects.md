# shared-relicEffects
**File:** `supabase/functions/_shared/relicEffects.ts`
**Status:** New
**Prereqs:** migration-034-exploration, shared-abilityDsl

## Functionality
```pseudocode
// Static map of relic name → DSL op array.
// Consumed by game-use-relic.

RELIC_EFFECTS: Record<string, Op[]> = {
  // ACTION relics (require active_player_id = player_id):
  'Dominus Orb':      [{ op:'dominus_orb_move' }],        // custom op: allow movement from CC systems this action
  'Maw Of Worlds':    [{ op:'exhaust_all_planets' }, { op:'gain_technology', count:1 }],
  'Stellar Converter':[{ op:'stellar_converter' }],        // custom op: destroy planet + purge card
  'The Codex':        [{ op:'take_from_discard', deck:'action_card', count:3 }],
  'Enigmatic Device': [{ op:'spend_resources', amount:6 }, { op:'gain_technology', count:1 }],

  // Reactive relics (no active-player gate; player triggers manually):
  'Scepter Of Emelpar':  [{ op:'spend_from_reinforcements' }],  // custom op: spend strategy token from reinforcements
  'The Crown Of Thalnos':[{ op:'reroll_combat_dice' }],          // custom op: reroll with +1, destroy units that get no hits
  'The Obsidian':        [{ op:'draw_secret_objective' }],        // triggers on gain; also increases secret obj limit
  "The Prophet's Tears": [{ op:'choice', options:[ [{op:'ignore_prerequisite'}], [{op:'draw_action_card',count:1}] ] }],
  'The Crown Of Emphidia':[{ op:'explore_planet', target:'any_controlled' }],  // exhaust to explore; purge for VP if Tomb owned
  'Shard Of The Throne': [],  // VP is tracked at gain/loss time directly; no op needed
}

// Relics whose effect is too complex to express as simple ops get a custom op name
// that game-use-relic dispatches to a dedicated handler function.
```

## Tests
No standalone test file — covered through `game-use-relic` tests per relic type.
