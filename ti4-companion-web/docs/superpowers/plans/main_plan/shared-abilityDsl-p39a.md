# shared-abilityDsl-p39a
**File:** `supabase/functions/_shared/abilityDsl.ts`
**Status:** Modify
**Prereqs:** shared-abilityDsl (p30), migration-048-promissory-dsl

## Functionality
- Add to ResolveContext: `noteInstanceId?: string`, `noteOriginPlayerId?: string`
- Add `case 'purge_relic_fragments':` to interpretOp switch (before `default:`)
  - Read `context.selections.fragment_type` (cultural|hazardous|industrial)
  - Read `op.count` (number of fragments to purge)
  - Query `game_exploration_decks` WHERE game_id=gameId, resolved_by_player_id=activatingPlayerId, relic_fragment_type=fragType, state='held', LIMIT count
  - Throw dslError if fewer than count found
  - UPDATE state='discarded', resolved_by_player_id=null on those fragment rows

## Tests
- purge_relic_fragments: sufficient fragments → discards count rows
- purge_relic_fragments: insufficient fragments → throws 409
- purge_relic_fragments: missing fragment_type in selections → throws dslError
