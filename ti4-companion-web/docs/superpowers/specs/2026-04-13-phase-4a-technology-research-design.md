# Phase 4a — Technology Research Design

**Date:** 2026-04-13
**Status:** Approved

---

## Goal

Add a visual tech tree modal that lets players view researched technologies, see what is available to research (including exhaust paths), preview what would unlock after researching a tech, and confirm research via an Edge Function.

---

## Scope

**In Phase 4a:**
- Visual tech tree modal (Faction, Unit Upgrades, Biotic, Propulsion, Cybernetic, Warfare sections)
- Five tech status states: Held, Available, Available via Exhaust, Unavailable, Preview
- Multi-planet exhaust path for skipping prerequisites
- Bypass-prerequisites flag for faction abilities / action card effects
- Any player can view any other player's tech tree (read-only)
- `game-research-technology` Edge Function

**Deferred:**
- Action card / faction ability UI that triggers bypass_prerequisites (Phase 4b)
- Planet claiming that populates `tech_specialty` (Phase 4d)

---

## Layout

Modal overlay opened from a "Technologies" button in `MyPanelSection`. Also accessible read-only via a "View Tech" icon button on each player row in `ScoreboardSection`.

The modal renders two full-width sections followed by a four-column grid:

1. **Faction** (full width) — faction-specific techs filtered by `technologies.faction = player.faction`
2. **Unit Upgrades** (full width) — techs where `is_unit_upgrade = true`
3. **Four-column grid** — one column per colour, each sorted by prerequisite count ascending:
   - Biotic (`colour = 'green'`)
   - Propulsion (`colour = 'blue'`)
   - Cybernetic (`colour = 'yellow'`)
   - Warfare (`colour = 'red'`)

---

## Tech Status States

| Status | Visual | Condition |
|---|---|---|
| `held` | Green border | Tech name is in `player.technologies` |
| `available` | Blue border | All prerequisite colours satisfied by held techs |
| `exhaust` | Dashed orange border | One or more missing prereq colours can be covered by exhausting a readied tech-specialty planet (or via AI Development Algorithm) |
| `unavailable` | Dark/dim | Prerequisites not satisfiable by held techs or available exhaust options |
| `preview` | Pulsing glow | Would become `available` or `exhaust` if the currently selected tech were researched |

Unavailable techs show a tooltip listing the missing prerequisite colours and counts.

---

## Architecture

### Data Flow

`GameScreen` fetches the `technologies` reference table once on mount (filtered by the game's expansions) and passes `allTechnologies` as a prop. No new Realtime subscriptions are needed — tech changes propagate via the existing `game_players` subscription (which includes the `technologies TEXT[]` column).

| Data | Source | Already loaded? |
|---|---|---|
| `player.technologies` (TEXT[]) | `useGame` | Yes |
| `player.faction` | `useGame` | Yes |
| `planets` (with `tech_specialty`, `exhausted`) | `useGame` | Yes (after migration 008) |
| `allTechnologies` | `technologies` reference table | New fetch in `GameScreen` |

### `useTechTree(player, planets, allTechnologies)`

All prerequisite logic, preview computation, and exhaust-path resolution lives in this hook. Returns:

- `sections` — `{ faction, unitUpgrades, biotic, propulsion, cybernetic, warfare }`, each an array of tech objects annotated with `status`, `missingPrereqs`, and `exhaustOptions`
- `selectedTech` — currently selected (preview) tech, or null
- `selectTech(techId)` — sets selected tech and recomputes preview statuses
- `clearSelection()` — deselects
- `confirmResearch(techId, exhaustPlanetIds?, bypassPrerequisites?)` — calls `game-research-technology` Edge Function

**Prerequisite logic:**
1. Count held techs per colour from `player.technologies` cross-referenced with `allTechnologies`
2. For each prerequisite colour: if count satisfied → met; else check exhaust path
3. Exhaust path: player has a readied `game_player_planets` row whose `tech_specialty` matches the missing colour, OR player holds AI Development Algorithm (covers any one colour)
4. If all missing colours can be covered by exhaust → status `exhaust`; `exhaustOptions` lists valid planets
5. Otherwise → status `unavailable`; `missingPrereqs` lists unresolvable colours

**Preview computation:**
Re-runs the full status computation with the selected tech added to `player.technologies`. Techs that change from `unavailable`/`exhaust` to `available`/`exhaust` are marked `preview`.

### Scoreboard Integration

Each row in `ScoreboardSection` gets a "View Tech" icon button that calls `onViewTech(playerId)`. `GameScreen` owns `viewingTechPlayerId` state and passes the relevant player's data to `TechTreeModal`.

---

## Schema — Migration 008

```sql
ALTER TABLE public.game_player_planets
  ADD COLUMN tech_specialty TEXT; -- null | 'green' | 'blue' | 'yellow' | 'red'
```

Populated at insert time (not queried from tile on every load):
- **`game-start`** — updated to read `tech_specialty` from `tiles.planets` JSONB when inserting home-system planets
- **Phase 4d** planet claim Edge Function — will do the same when planets are claimed during play

---

## Edge Function — `game-research-technology`

**Caller:** the researching player (own row only — RLS enforced)

**Inputs:**

| Field | Type | Description |
|---|---|---|
| `game_id` | UUID | |
| `tech_name` | TEXT | Must match a `technologies.name` valid for this game's expansions |
| `exhaust_planet_ids` | UUID[]? | Planets to exhaust; one per missing prerequisite colour |
| `bypass_prerequisites` | boolean? | If true, skip all prerequisite validation |

**Validation:**
1. Load tech from `technologies` — error if not found or wrong expansion
2. Load calling player's `game_players` row and `technologies TEXT[]`
3. If `bypass_prerequisites = true` → skip to writes
4. Count how many of each prerequisite colour the player holds
5. For each missing colour, consume one entry from `exhaust_planet_ids`:
   - Planet must belong to this player, be readied, and `tech_specialty` must match the missing colour
   - OR player holds AI Development Algorithm (any one colour)
6. Error if any prerequisite colour remains unmet

**Writes (on success):**
1. Append `tech_name` to `game_players.technologies`
2. For each planet in `exhaust_planet_ids`: `UPDATE game_player_planets SET exhausted = true`

---

## Components

| Component | File | Responsibility |
|---|---|---|
| `TechTreeModal` | `src/components/game/TechTreeModal.jsx` | Modal wrapper; calls `useTechTree`; owns selected tech state; renders sections in order |
| `TechTreeSection` | `src/components/game/TechTreeSection.jsx` | Labelled group of `TechCard`s; reused for all 6 sections |
| `TechCard` | `src/components/game/TechCard.jsx` | Status styling, prereq dots (filled vs empty), click to select, tooltip on unavailable, confirm button on own tree when selected |
| `ExhaustPlanetPicker` | `src/components/game/ExhaustPlanetPicker.jsx` | Multi-select of valid readied specialty planets; one pick per missing colour; appears inline on selected exhaust-path tech |

`useTechTree` lives at `src/hooks/useTechTree.js`.

All components below `TechTreeModal` are purely presentational.

---

## Testing

**Unit — `useTechTree` (pure logic, no mocks):**
- Correct status for each of the four base states
- `missingPrereqs` lists correct colours and counts for unavailable techs
- `exhaustOptions` returns only readied planets whose `tech_specialty` matches a missing colour
- Preview recomputes correctly — newly unlocked techs show `preview`
- `bypass_prerequisites` skips all prereq checks
- Multi-planet exhaust correctly matches each planet to a specific missing colour
- AI Development Algorithm counts as any one colour
- Faction techs appear only for the matching faction
- Unit upgrades correctly separated from colour techs

**Component rendering:**
- `TechCard` — correct border/style per status; prereq dots filled vs empty; tooltip shown on unavailable; confirm button shown only on own tree when selected
- `ExhaustPlanetPicker` — lists only valid readied specialty planets; allows multi-select up to the number of missing prereqs
- `TechTreeModal` — sections render in correct order; read-only when viewing another player's tree

**No Edge Function unit tests** (consistent with Phases 1–3 — smoke tested manually post-deploy).
