# fn-game-resolve-ability-p43b
**File:** `supabase/functions/game-resolve-ability/index.ts`
**Status:** Modify
**Prereqs:** fn-game-resolve-ability-p43a, shared-leaderEffects-p43b, shared-abilityHandlers-p43b

## Changes
The hero branch added in p43a already handles purge via `HERO_ABILITIES` lookup. Phase 40b populates `HERO_ABILITIES` so no structural changes are needed — just ensure the Titans special-case remains correct.

No new code changes required beyond what p43a added. This spec exists to track that hero ability data is wired end-to-end.

## Tests
```pseudocode
// Extend existing game-resolve-ability test file:
describe('hero activation — Creuss riftwalker'):
  mock leaders.hero='unlocked', faction='The Ghosts Of Creuss'
  mock two valid wormhole system keys in selections
  EXPECT creuss_riftwalker handler called
  EXPECT game_players.leaders.hero updated to 'purged'

describe('hero activation — Titans'):
  mock leaders.hero='unlocked', faction='The Titans Of Ul'
  EXPECT titans_hero handler called
  EXPECT no purge write to game_players

describe('hero activation — Sol (simple DSL)'):
  mock leaders.hero='unlocked', faction='The Federation Of Sol'
  EXPECT reclaim_command_tokens op applied
  EXPECT leaders.hero='purged'
```
