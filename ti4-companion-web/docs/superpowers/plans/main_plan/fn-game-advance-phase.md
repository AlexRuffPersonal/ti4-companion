# fn-game-advance-phase

**File:** `supabase/functions/game-advance-phase/index.ts`
**Status:** Modify
**Prereqs:** fn-game-play-strategy-card, migration-035-ability-dsl-completions

## Phase 12 Changes

Wire strategy → action phase transition:

```pseudocode
if game.phase === 'strategy':
  find player with lowest strategy_card (already done — no change)

// Add: 'agenda' as a valid phase to advance from (status → agenda already handled)
// Extend phase CHECK to include agenda → strategy transition
```

## Phase 19 Changes

When advancing out of the agenda phase (status → agenda already handled by existing code),
reset `vote_prevented` for all players so it does not carry over between agenda cards:

```pseudocode
if nextPhase === 'agenda':
  UPDATE game_players SET vote_prevented = false WHERE game_id = gameId
```

## Phase 21 Changes

During Status Phase processing (when `game.phase === 'status'`), after readying planet cards, also ready all legendary cards:

```pseudocode
UPDATE game_player_legendary_cards SET status='readied' WHERE game_id=gameId
```

## Tests

Extend `tests/functions/game-advance-phase.test.js`:

```pseudocode
T: status → agenda (agenda_unlocked=true): game_players.update called with { vote_prevented: false }
T: status phase: game_player_legendary_cards.update called with { status:'readied' }
```
