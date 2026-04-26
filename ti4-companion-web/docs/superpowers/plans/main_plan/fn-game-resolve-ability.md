# fn-game-resolve-ability

**File:** `supabase/functions/game-resolve-ability/index.ts`
**Status:** Modify
**Prereqs:** shared-abilityDsl

## Changes

Add `source_type: 'strategy_card'` as a valid source type alongside existing types (`faction_ability`, `action_card`, `leader`, etc.).

```pseudocode
// In the source_type validation block, add:
VALID_SOURCE_TYPES = [...existing..., 'strategy_card']

// No other changes needed — the ability DSL executor already handles
// all ops generically. The new ops added in shared-abilityDsl are
// automatically available for strategy_card ability_definitions.
```

## Tests

Extend existing `game-resolve-ability` test file. Add one test group per new DSL op:

```pseudocode
STD_MOCKS REQ(game_id, ability_definition_id, source_type:'strategy_card', source_id:'4', selections:{})

describe('spend_strategy_token'):
  T409('insufficient strategy tokens') — mock player with strategy=0
  EXPECT command_tokens.strategy decremented by 1

describe('replenish_commodities target=self'):
  EXPECT player commodities set to faction max

describe('replenish_commodities target=chosen_player'):
  EXPECT chosen player commodities set to their faction max

describe('gain_trade_goods'):
  EXPECT trade_goods incremented by op.amount

describe('place_structure space_dock'):
  T409('planet already has space dock') — mock space_dock_unit_id != null
  EXPECT space_dock_unit_id set on planet

describe('place_structure pds'):
  T409('planet already has 2 PDS') — mock pds_count = 2
  EXPECT pds_count incremented

describe('ready_planets'):
  T409('planet not exhausted') — mock exhausted=false
  EXPECT named planets set exhausted=false

describe('set_speaker'):
  T409('player not in game')
  EXPECT games.speaker_player_id updated

describe('score_imperial_point'):
  T409('does not control Mecatol Rex')
  EXPECT player vp incremented by 1

describe('draw_action_card'):
  T409('deck empty')
  EXPECT top deck card moved to hand

describe('draw_secret_objective'):
  T409('deck empty')
  EXPECT top secret objective moved to held
```
