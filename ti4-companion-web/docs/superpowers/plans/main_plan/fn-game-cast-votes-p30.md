# fn-game-cast-votes-p30

**File:** `supabase/functions/game-cast-votes/index.ts`
**Status:** Modify
**Prereqs:** fn-game-cast-votes (p19), migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — Predictive Intelligence, Genetic Recombination, Mirror Computing

```pseudocode
// Mirror Computing: TGs worth 2 influence each when spending for votes
if 'Mirror Computing' IN player.technologies:
  effectiveTgValue = 2  // each TG counts as 2 influence for vote casting
else:
  effectiveTgValue = 1

// Genetic Recombination: open window before target player votes
mahactPlayer = find opponent where 'Genetic Recombination' IN technologies
  AND 'Genetic Recombination' NOT IN exhausted_technologies
if mahactPlayer AND caller is not mahactPlayer:
  open pending_action_window { type:'before_player_votes',
    eligible:[mahactPlayer.id], context:{ voting_player_id:player.id } }
  // if Mahact responds: exhaust Genetic Recombination; set constraint on voting_player_id's vote choice
  // if voting player does not comply: remove 1 fleet token

// Predictive Intelligence: cast 3 extra votes optionally
if 'Predictive Intelligence' IN player.technologies AND selections.use_predictive:
  extraVotes = 3
  // track that Predictive was used this vote; game-resolve-agenda will exhaust if outcome lost
```

## Tests

```pseudocode
GIVEN Mirror Computing owned EXPECT TGs counted as 2 influence each
GIVEN Genetic Recombination unexhausted Mahact opponent exists EXPECT window opened before vote
GIVEN Predictive Intelligence owned, use_predictive=true EXPECT 3 extra votes added
```
