# Phase 38 — Dark Energy Tap Technology Effects

## Overview

Implements the two game effects of the Dark Energy Tap technology:

1. **Retreat to empty systems** — retreating player with DET may retreat to adjacent systems they have no presence in, provided that system is completely empty of ships.
2. **Frontier exploration after tactical action** — after completing a tactical action (specifically after the production phase), a player with DET may explore a frontier token in the active system.

Also includes a **bug fix** for Phase 20: the `game-declare-retreat` function incorrectly extends the retreat range to 2 hops for DET owners. Retreat range is always 1 hop regardless of DET.

**Prerequisites:** Phase 18 (movement / `fn-game-move-ships`), Phase 20 (space combat action cards / `fn-game-declare-retreat`), Phase 30 (technology effect enforcement / `shared-techEffects`)

**No migration required.** Pure logic changes to an existing edge function and client components.

---

## Rules Basis

**§35.4:** "Players can explore space areas that contain frontier tokens if they own the 'Dark Energy Tap' technology or if another game effect allows them to."

**§78.7c:** "The system that a player's units retreat to must contain one or more of that player's units, a planet they control, or both. Additionally, the system cannot contain ships controlled by another player." — DET removes the own-presence requirement but the destination must be completely empty of all ships.

---

## Part 1: `game-declare-retreat` — Bug Fix + DET Retreat Logic

**File:** `supabase/functions/game-declare-retreat/index.ts`

### Bug fix

Remove the incorrect DET-based hop extension introduced in Phase 20. Retreat range is always 1 hop.

```
// REMOVE:
const maxHops = hasDarkEnergyTap ? 2 : 1
// REPLACE WITH:
const maxHops = 1
```

### DET retreat destination validation

Replace the existing own-presence check with a branch:

```
if hasDarkEnergyTap:
  // destination must be completely empty — no ships from any player
  allShipsInDest = query game_player_units
    WHERE game_id=game_id AND system_key=destination AND on_planet IS NULL
  if allShipsInDest.length > 0:
    ERR 409 'Destination must be empty for Dark Energy Tap retreat'
else:
  // existing check: player must have units or controlled planets in destination
  unitsInDest = query game_player_units WHERE game_id + system_key=destination + player_id=player.id + on_planet IS NULL
  planetsInDest = query game_player_planets WHERE game_id + system_key=destination + player_id=player.id
  if unitsInDest.length === 0 AND planetsInDest.length === 0:
    ERR 409 'No presence in destination system: no units or controlled planets'
```

### Tests

Extend `tests/functions/game-declare-retreat.test.js`:

```
// Bug fix regression
GIVEN no DET, destination 1 hop away with own presence → retreat accepted (unchanged)
GIVEN no DET, destination 2 hops away → 409 (was incorrectly accepted in Phase 20 impl)

// DET retreat to empty system
GIVEN DET, destination 1 hop away, destination completely empty → retreat accepted
GIVEN DET, destination 1 hop away, destination has own units → 409 'must be empty'
GIVEN DET, destination 1 hop away, destination has enemy ships → 409 'must be empty'
GIVEN DET, destination 2 hops away → 409 (range still 1 hop)

// Non-DET own-presence check regression
GIVEN no DET, destination has own units but no planets → retreat accepted
GIVEN no DET, destination has own planets but no units → retreat accepted
GIVEN no DET, destination has neither units nor planets → 409
```

---

## Part 2: Client-Side — Frontier Exploration After Tactical Action

### Architecture

No new edge function or hook required. The existing `game-explore-frontier` edge function and `exploreFrontier` client wrapper (Phase 17) handle the actual exploration. Detection and prompting are client-side.

**Trigger point:** After the production phase of a tactical action — specifically when the player clicks "DONE" in `SystemActionModal` (new button). This fires once per tactical action and is compatible with Fleet Logistics (which allows multiple tactical actions per turn), since each tactical action has its own `game-activate-system` → movement → combat → production cycle.

### `SystemActionModal.jsx`

**File:** `src/components/game/SystemActionModal.jsx`

Add props: `hasFrontierToken: bool`, `hasDarkEnergyTap: bool`, `onExploreFrontier: (systemKey) => void`

Add a "DONE" button, shown when the system is activated by the caller and they are the active player (same conditions as PRODUCE UNITS). Clicking DONE:

- If `hasFrontierToken && hasDarkEnergyTap`: transition to inline confirmation state showing "EXPLORE FRONTIER TOKEN?" with EXPLORE and SKIP buttons
  - EXPLORE → calls `onExploreFrontier(systemKey)` → closes modal
  - SKIP → closes modal
- Otherwise: closes modal immediately

```pseudocode
[confirmingFrontier, setConfirmingFrontier] = useState(false)

IF systemActivatedByMe AND isActivePlayer:
  IF !confirmingFrontier:
    <button btn-ghost "DONE" onClick={() => {
      if (hasFrontierToken && hasDarkEnergyTap) setConfirmingFrontier(true)
      else onClose()
    }} />
  ELSE:
    LABEL("EXPLORE FRONTIER TOKEN?")
    MUTED("You may explore the frontier token in this system.")
    <button btn-primary "EXPLORE" onClick={() => { onExploreFrontier(systemKey); onClose() }} />
    <button btn-ghost "SKIP" onClick={onClose} />
```

### `GalaxyTab.jsx`

**File:** `src/components/game/GalaxyTab.jsx`

Derive and pass DET state to `SystemActionModal`:

```pseudocode
// Derive from existing loaded state
activeSystemHasFrontierToken =
  systemStates[activeSystemKey]?.has_frontier_token ?? false

hasDarkEnergyTap =
  (myPlayer?.technologies ?? []).includes('Dark Energy Tap')

// Handler: call existing exploreFrontier wrapper, show ExplorationModal on success
handleExploreFrontier = async (systemKey) => {
  result = await exploreFrontier(gameId, myPlayer.id, systemKey)
  if result?.card_name: openExplorationModal({ card_name: result.card_name, system_key: systemKey })
}

// Pass to SystemActionModal:
<SystemActionModal
  ...existingProps
  hasFrontierToken={activeSystemHasFrontierToken}
  hasDarkEnergyTap={hasDarkEnergyTap}
  onExploreFrontier={handleExploreFrontier}
/>
```

### Tests

```pseudocode
// SystemActionModal
it('renders DONE button when system activated by caller and is active player')
it('closes immediately on DONE when DET conditions not met')
it('shows inline confirmation on DONE when hasFrontierToken and hasDarkEnergyTap')
it('calls onExploreFrontier and closes on EXPLORE')
it('closes on SKIP without calling onExploreFrontier')
it('does not render DONE when system not activated by caller')

// GalaxyTab
it('passes hasFrontierToken=true when active system state has has_frontier_token=true')
it('passes hasDarkEnergyTap=true when myPlayer technologies includes Dark Energy Tap')
it('calls exploreFrontier and opens ExplorationModal on handleExploreFrontier')
```

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/game-declare-retreat/index.ts` | Bug fix (maxHops) + DET branch in destination check |
| `src/components/game/SystemActionModal.jsx` | Add DONE button + inline frontier confirmation |
| `src/components/game/GalaxyTab.jsx` | Derive DET state, pass to SystemActionModal, handle explore callback |

## Phase

**Phase 38 — Dark Energy Tap Technology Effects**
