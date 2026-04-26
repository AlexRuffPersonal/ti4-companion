# Phase 10: Space Combat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full server-authoritative space combat system triggered when a player activates a system containing enemy ships.

**Architecture:** Combat state lives in a `game_combats` row updated by Edge Functions. A `useCombat` hook subscribes to the specific combat row and vends dispatchers. `useGalaxy` gains a parallel subscription so `GalaxyTab` knows to render `SpaceCannonModal` or `CombatModal` based on phase.

**Tech Stack:** React 19, Supabase Realtime, Deno/TypeScript Edge Functions, Vitest + @testing-library/react, Tailwind CSS 3

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/007_combat.sql` | Create |
| `supabase/functions/game-activate-system/index.ts` | Modify |
| `supabase/functions/game-fire-space-cannon/index.ts` | Create |
| `supabase/functions/game-roll-combat-dice/index.ts` | Create |
| `supabase/functions/game-assign-hits/index.ts` | Create |
| `supabase/functions/game-declare-retreat/index.ts` | Create |
| `supabase/functions/game-advance-phase/index.ts` | Modify |
| `src/hooks/useCombat.js` | Create |
| `src/hooks/useGalaxy.js` | Modify |
| `src/components/game/CombatModal.jsx` | Create |
| `src/components/game/FleetDisplay.jsx` | Create |
| `src/components/game/DiceResultsPanel.jsx` | Create |
| `src/components/game/SpaceCannonModal.jsx` | Create |
| `src/components/game/RetreatDestinationPicker.jsx` | Create |
| `src/components/game/GalaxyTab.jsx` | Modify |
| `src/lib/edgeFunctions.js` | Modify |

---

## Tasks

| # | File | Description |
|---|------|-------------|
| [01](task-01-db-migration.md) | `supabase/migrations/007_combat.sql` | DB migration — new tables + damaged column |
| [02](task-02-edge-function-wrappers.md) | `src/lib/edgeFunctions.js` | Phase 10 edge function wrappers |
| [03](task-03-activate-system-combat.md) | `game-activate-system/index.ts` | Detect enemy ships, create combat + space cannon pending |
| [04](task-04-fire-space-cannon.md) | `game-fire-space-cannon/index.ts` | Fire or pass space cannon opportunity |
| [05](task-05-roll-combat-dice.md) | `game-roll-combat-dice/index.ts` | AFB barrage + main combat dice rolling |
| [06](task-06-assign-hits.md) | `game-assign-hits/index.ts` | Hit assignment with sustain/destroy + end-of-round logic |
| [07](task-07-declare-retreat.md) | `game-declare-retreat/index.ts` | Validate and declare retreat destination |
| [08](task-08-advance-phase-damaged-reset.md) | `game-advance-phase/index.ts` | Reset damaged flag when entering status phase |
| [09](task-09-use-combat-hook.md) | `src/hooks/useCombat.js` | Realtime hook + dispatchers for combat row |
| [10](task-10-use-galaxy-active-combat.md) | `src/hooks/useGalaxy.js` | Add activeCombat subscription to useGalaxy |
| [11](task-11-fleet-display.md) | `src/components/game/FleetDisplay.jsx` | Unit chips with damage state + interactive hit assignment |
| [12](task-12-dice-results-panel.md) | `src/components/game/DiceResultsPanel.jsx` | Dice roll display grouped by unit type |
| [13](task-13-retreat-destination-picker.md) | `src/components/game/RetreatDestinationPicker.jsx` | Adjacent valid system picker for retreat |
| [14](task-14-space-cannon-modal.md) | `src/components/game/SpaceCannonModal.jsx` | Per-player space cannon fire/pass UI |
| [15](task-15-combat-modal.md) | `src/components/game/CombatModal.jsx` | Top-level combat orchestration modal |
| [16](task-16-galaxy-tab-wiring.md) | `src/components/game/GalaxyTab.jsx` | Wire useCombat + combat modals into GalaxyTab |

---

## Run Tests

All tests run from `ti4-companion-web/`:

```bash
npm test                              # full suite
npx vitest run tests/functions/game-fire-space-cannon.test.js   # single file
npx vitest run tests/hooks/useCombat.test.js
```

## Deploy Edge Functions

```bash
supabase functions deploy game-activate-system --no-verify-jwt
supabase functions deploy game-fire-space-cannon --no-verify-jwt
supabase functions deploy game-roll-combat-dice --no-verify-jwt
supabase functions deploy game-assign-hits --no-verify-jwt
supabase functions deploy game-declare-retreat --no-verify-jwt
supabase functions deploy game-advance-phase --no-verify-jwt
```
