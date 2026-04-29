# shared-auth-p33

**File:** `supabase/functions/_shared/auth.ts`
**Status:** Modify
**Prereqs:** migration-044-bot-players

## Functionality

```pseudocode
// New export — replaces inline turn checks in edge functions
export function requireTurnAuth(game, callerPlayer, activePlayer): void
  // Normal human turn
  if callerPlayer.id === game.active_player_id: return
  // Host acting for a bot
  if activePlayer.is_bot AND callerPlayer.id === game.host_player_id: return
  ERR('Not your turn', 403)
```

Edge functions that currently do an inline `if caller.id !== game.active_player_id` check switch to calling `requireTurnAuth(game, callerPlayer, activePlayer)` instead. Functions affected: `game-end-turn`, `game-player-pass`, `game-activate-system`, and any other function that enforces active-player turn order.

No changes to `requireAuth`, `AuthError`, or any other existing export.

## Tests

```pseudocode
requireTurnAuth: caller is active player → no error
requireTurnAuth: caller is host AND active player is_bot → no error
requireTurnAuth: caller is not active player AND active player is not bot → ERR 403
requireTurnAuth: caller is host but active player is not bot → ERR 403
requireTurnAuth: caller is non-host AND active player is bot → ERR 403
```
