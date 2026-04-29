# fn-game-play-action-card-p30

**File:** `supabase/functions/game-play-action-card/index.ts`
**Status:** Modify
**Prereqs:** fn-game-play-action-card-p29a, migration-043-tech-effects, shared-techEffects

## Changes

### Phase 30 — Instinct Training and Transparasteel Plating

```pseudocode
// Transparasteel Plating: passed players cannot play action cards during Yssaril's turn
yssarilPlayer = find player where 'Transparasteel Plating' IN technologies
if yssarilPlayer AND game.active_player_id === yssarilPlayer.id:
  if caller has passed this round:
    ERR 409 'Cannot play action cards during Yssaril turn after passing'

// After action card is played, open Instinct Training window
xxchaPlayer = find opponent where 'Instinct Training' IN technologies
  AND 'Instinct Training' NOT IN exhausted_technologies
  AND xxchaPlayer.command_tokens.strategy >= 1
if xxchaPlayer:
  open pending_action_window { type:'when_action_card_played',
    eligible:[xxchaPlayer.id], context:{ card_id, playing_player_id } }
  // if Xxcha responds (via game-pass-action-window or a resolve fn),
  // cancel the card: UPDATE game_action_card_deck SET state='discard'
  // exhaust 'Instinct Training', spend 1 strategy token
```

## Tests

```pseudocode
GIVEN Transparasteel Plating owner is active player, caller has passed EXPECT 409
GIVEN Instinct Training unexhausted, Xxcha has strategy token EXPECT window opened after card played
GIVEN no Instinct Training owner EXPECT no window opened
```
