# component-LobbyScreen-p33

**File:** `src/components/game/LobbyScreen.jsx`
**Status:** Modify
**Prereqs:** client-edgeFunctions-p33

## Functionality

```pseudocode
// Add to host controls section (below existing player slots):

<AddBotSection>
  host only; renders "Add Bot" button
  onClick: opens inline form with fields:
    - Display name (text input, default "Bot {n}")
    - Faction picker (same as human player, excludes already-taken factions)
    - Colour picker (same as human player, excludes taken colours)
    - Strategy toggle: "Scripted" | "Random"
  Submit → addBot(gameId, displayName, faction, color, botStrategy)
  Errors displayed inline (faction taken, colour taken, etc.)

<BotSlot> (one per is_bot player in players list)
  Robot icon + display name + faction + colour chip
  Strategy badge ("Scripted" | "Random")
  "Remove" button (host only) → removeBot(gameId, botPlayer.id)

// No changes to human player slots or existing host controls.
```

## Tests

```pseudocode
AddBotSection renders only for host
AddBotSection submit: calls addBot with correct args
AddBotSection shows server error inline on failure
BotSlot renders for each is_bot player
BotSlot Remove button calls removeBot with bot player id
BotSlot Remove button hidden for non-host
```
