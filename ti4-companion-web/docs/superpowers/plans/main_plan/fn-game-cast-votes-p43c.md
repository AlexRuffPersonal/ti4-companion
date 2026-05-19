# fn-game-cast-votes-p43c
**File:** `supabase/functions/game-cast-votes/index.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c, shared-abilityHandlers-p43c

## Changes
```pseudocode
// Apply CAST_VOTES inline passives before recording vote total:
{ inlineEffects } = await applyCommanderPassives('CAST_VOTES', {
  gameId, activatingPlayerId: player.id,
  selections: body.selections  // includes exhausted_planet_count, trade_goods_spent
}, db)

// context.extraVotes set by xxcha_extra_vote_per_planet and hacan_trade_good_votes
finalVoteCount = body.vote_count + (context.extraVotes ?? 0)

// Xxcha "game effects cannot prevent you from voting" flag:
xxchaUnlocked = player.faction === 'The Xxcha Kingdom' AND player.leaders?.commander === 'unlocked'
if xxchaUnlocked: context.votePreventionImmune = true

// Use finalVoteCount when upserting game_agenda_votes
```

## Tests
```pseudocode
describe('Xxcha commander — extra vote per planet'):
  mock Xxcha with unlocked commander, selections.exhausted_planet_count=3, base votes=5
  EXPECT vote total = 8

describe('Hacan commander — trade goods to votes'):
  mock Hacan with unlocked commander, trade_goods=4, selections.trade_goods_spent=2
  EXPECT vote total increases by 4 (2 TG × 2 votes each)
  EXPECT player trade_goods reduced by 2

describe('Xxcha commander — vote prevention immunity'):
  mock Xxcha with unlocked commander, player has vote_prevented=true
  EXPECT vote still cast (immunity overrides prevent)
```
