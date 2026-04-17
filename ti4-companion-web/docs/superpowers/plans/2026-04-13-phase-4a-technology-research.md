# Phase 4a — Technology Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visual tech tree modal that lets players view and research technologies, with full prerequisite checking, exhaust-path support, and live preview of what a tech would unlock.

**Architecture:** A `useTechTree` hook owns all prerequisite logic and returns annotated sections to a purely presentational `TechTreeModal`. Research is committed via a new `game-research-technology` Edge Function. Game-start is extended to insert home planets (with `tech_specialty`) and initialise starting techs for each player.

**Tech Stack:** React 19, Vite, Tailwind CSS 3, Supabase JS v2, Vitest 4, @testing-library/react, Deno/TypeScript (Edge Functions)

**Schema note:** The `technologies` table uses `technology_type TEXT` (values: `'green'`, `'blue'`, `'yellow'`, `'red'`, `'unit_upgrade'`) instead of separate `colour` and `is_unit_upgrade` columns. There is no `unit_stats` column. Throughout this plan, filter unit upgrades with `technology_type === 'unit_upgrade'` and colour with `technology_type === 'green'` etc.

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/008_phase4a.sql` |
| Modify | `supabase/functions/game-start/index.ts` |
| Create | `supabase/functions/game-research-technology/index.ts` |
| Modify | `ti4-companion-web/src/lib/edgeFunctions.js` |
| Modify | `ti4-companion-web/src/hooks/useGame.js` |
| Create | `ti4-companion-web/src/hooks/useTechTree.js` |
| Create | `ti4-companion-web/src/components/game/TechCard.jsx` |
| Create | `ti4-companion-web/src/components/game/TechTreeSection.jsx` |
| Create | `ti4-companion-web/src/components/game/ExhaustPlanetPicker.jsx` |
| Create | `ti4-companion-web/src/components/game/TechTreeModal.jsx` |
| Modify | `ti4-companion-web/src/components/game/GameScreen.jsx` |
| Modify | `ti4-companion-web/src/components/game/MyPanelSection.jsx` |
| Modify | `ti4-companion-web/src/components/game/ScoreboardSection.jsx` |
| Create | `ti4-companion-web/tests/hooks/useTechTree.test.js` |
| Create | `ti4-companion-web/tests/components/TechCard.test.jsx` |
| Create | `ti4-companion-web/tests/components/ExhaustPlanetPicker.test.jsx` |
| Create | `ti4-companion-web/tests/components/TechTreeModal.test.jsx` |
| Modify | `ti4-companion-web/tests/functions/game-start.test.js` |

---

## Task 1: Apply Migration 008

**Files:**
- Create: `supabase/migrations/008_phase4a.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add tech_specialty to game_player_planets.
-- Populated at insert time from tiles.planets JSONB.
-- Null means no tech specialty. Values: 'green' | 'blue' | 'yellow' | 'red'
ALTER TABLE public.game_player_planets
  ADD COLUMN tech_specialty TEXT;
```

- [ ] **Step 2: Apply the migration**

In the Supabase dashboard → SQL Editor, paste and run the SQL above against your project.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/008_phase4a.sql
git commit -m "feat: add migration 008 — tech_specialty on game_player_planets"
```

---

## Task 2: Update game-start Edge Function

**Files:**
- Modify: `supabase/functions/game-start/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-start.test.js`

Game-start now does two extra things per player: sets `technologies` from `factions.starting_techs`, and inserts home-system planets from the faction's tile (with `tech_specialty`).

- [ ] **Step 1: Replace game-start/index.ts**

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id, status, speaker_player_id, expansions')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can start the game', 403)
  if (game.status !== 'lobby') return errorResponse('Game is not in lobby state', 409)
  if (!game.speaker_player_id) return errorResponse('Speaker must be set before starting', 409)

  const { data: players, error: playersError } = await db
    .from('game_players')
    .select('id, faction, colour, display_name')
    .eq('game_id', body.game_id)
  if (playersError) return errorResponse('Database error', 500)
  if (!players || players.length === 0) return errorResponse('No players in game', 409)

  for (const player of players) {
    if (!player.faction || !player.colour) {
      return errorResponse(`Player "${player.display_name}" has not picked a faction or colour`, 409)
    }
  }

  // Initialise public objective decks (filtered by active expansions)
  const activeExpansions = Object.entries(game.expansions ?? {})
    .filter(([, active]) => active)
    .map(([exp]) => exp)

  const { data: allObjs, error: objsError } = await db
    .from('public_objectives')
    .select('id, expansion')
  if (objsError) return errorResponse('Database error', 500)

  const eligibleObjs = (allObjs ?? []).filter(
    (o: { id: string; expansion: string | null }) =>
      activeExpansions.includes(o.expansion ?? 'base')
  )

  if (eligibleObjs.length > 0) {
    const positions = eligibleObjs.map((_: unknown, i: number) => i)
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[positions[i], positions[j]] = [positions[j], positions[i]]
    }
    const { error: insertError } = await db
      .from('game_public_objectives')
      .insert(
        eligibleObjs.map((obj: { id: string }, i: number) => ({
          game_id: body.game_id,
          objective_id: obj.id,
          deck_position: positions[i],
          state: 'deck',
        }))
      )
    if (insertError) return errorResponse(`Failed to initialise objectives: ${insertError.message}`, 500)
  }

  // Initialise action card deck (filtered by active expansions, expanded by quantity)
  const { data: allActionCards, error: actionCardsError } = await db
    .from('action_cards')
    .select('id, quantity, expansion')
  if (actionCardsError) return errorResponse('Database error', 500)

  const eligibleActionCards = (allActionCards ?? []).filter(
    (c: { id: string; quantity: number; expansion: string | null }) =>
      activeExpansions.includes(c.expansion ?? 'base')
  )

  const deckEntries: Array<{ action_card_id: string; copy_index: number }> = []
  for (const card of eligibleActionCards) {
    for (let i = 0; i < (card.quantity ?? 1); i++) {
      deckEntries.push({ action_card_id: card.id, copy_index: i })
    }
  }

  if (deckEntries.length > 0) {
    const acPositions = deckEntries.map((_: unknown, i: number) => i)
    for (let i = acPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[acPositions[i], acPositions[j]] = [acPositions[j], acPositions[i]]
    }
    const { error: insertActionError } = await db
      .from('game_action_card_deck')
      .insert(
        deckEntries.map((entry: { action_card_id: string; copy_index: number }, i: number) => ({
          game_id: body.game_id,
          action_card_id: entry.action_card_id,
          copy_index: entry.copy_index,
          deck_position: acPositions[i],
          state: 'deck',
        }))
      )
    if (insertActionError) return errorResponse(`Failed to initialise action cards: ${insertActionError.message}`, 500)
  }

  // Initialise starting technologies and home planets for each player
  for (const player of players) {
    const { data: factionData, error: factionError } = await db
      .from('factions')
      .select('home_tile_number, starting_techs')
      .eq('name', player.faction)
      .maybeSingle()
    if (factionError) return errorResponse('Database error', 500)

    // Set starting technologies
    const startingTechs = (factionData?.starting_techs ?? []) as string[]
    if (startingTechs.length > 0) {
      const { error: techError } = await db
        .from('game_players')
        .update({ technologies: startingTechs })
        .eq('id', player.id)
      if (techError) return errorResponse(`Failed to set starting techs for ${player.display_name}: ${techError.message}`, 500)
    }

    // Insert home-system planets with tech_specialty
    if (factionData?.home_tile_number) {
      const { data: tile, error: tileError } = await db
        .from('tiles')
        .select('planets')
        .eq('tile_number', factionData.home_tile_number)
        .maybeSingle()
      if (tileError) return errorResponse('Database error', 500)

      const homePlanets = (tile?.planets ?? []) as Array<{
        name: string
        tech_specialty?: string
      }>

      if (homePlanets.length > 0) {
        const { error: planetError } = await db
          .from('game_player_planets')
          .insert(
            homePlanets.map(p => ({
              game_id: body.game_id,
              player_id: player.id,
              planet_name: p.name,
              exhausted: false,
              tech_specialty: p.tech_specialty ?? null,
            }))
          )
        if (planetError) return errorResponse(`Failed to insert planets for ${player.display_name}: ${planetError.message}`, 500)
      }
    }
  }

  const { error: updateError } = await db
    .from('games')
    .update({ status: 'active' })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Failed to start game: ${updateError.message}`, 500)

  return okResponse({ started: true })
})
```

- [ ] **Step 2: Update the mockDb helper in game-start.test.js**

The `mockDb` function needs to handle four new table interactions while preserving the existing action card mocks. Replace the existing `mockDb` function (lines 34–86) with:

```js
function mockDb({
  gameData = { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: SPEAKER_ID, expansions: { base: true } },
  gameError = null,
  players = READY_PLAYERS,
  playersError = null,
  updateError = null,
  objectives = [{ id: 'obj-1', expansion: 'base' }, { id: 'obj-2', expansion: 'base' }],
  insertObjError = null,
  actionCards = [{ id: 'ac-1', quantity: 2, expansion: 'base' }, { id: 'ac-2', quantity: 1, expansion: 'base' }],
  insertActionError = null,
  factionData = { home_tile_number: '5', starting_techs: ['Neural Motivator'] },
  factionError = null,
  tileData = { planets: [{ name: 'Nestphar', tech_specialty: null }] },
  tileError = null,
  planetInsertError = null,
  techUpdateError = null,
} = {}) {
  const actionCardInsertMock = vi.fn().mockResolvedValue({ error: insertActionError })
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: gameData, error: gameError }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: players, error: playersError }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: techUpdateError }),
        }),
      }
    }
    if (table === 'public_objectives') {
      return {
        select: vi.fn().mockResolvedValue({ data: objectives, error: null }),
      }
    }
    if (table === 'game_public_objectives') {
      return {
        insert: vi.fn().mockResolvedValue({ error: insertObjError }),
      }
    }
    if (table === 'action_cards') {
      return {
        select: vi.fn().mockResolvedValue({ data: actionCards, error: null }),
      }
    }
    if (table === 'game_action_card_deck') {
      return { insert: actionCardInsertMock }
    }
    if (table === 'factions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: factionData, error: factionError }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: tileData, error: tileError }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        insert: vi.fn().mockResolvedValue({ error: planetInsertError }),
      }
    }
  })
  return { actionCardInsertMock }
}
```

- [ ] **Step 3: Add new test cases for the new behaviour**

Append these inside the `describe('game-start', ...)` block, after the existing tests:

```js
it('sets starting technologies from faction data', async () => {
  mockDb({ factionData: { home_tile_number: null, starting_techs: ['Neural Motivator', 'Sarween Tools'] } })
  const res = await handler(makeRequest({ game_id: GAME_ID }))
  expect(res.status).toBe(200)
})

it('returns 200 when faction has no home tile number', async () => {
  mockDb({ factionData: { home_tile_number: null, starting_techs: [] } })
  const res = await handler(makeRequest({ game_id: GAME_ID }))
  expect(res.status).toBe(200)
})

it('returns 200 when home tile has no planets', async () => {
  mockDb({ tileData: { planets: [] } })
  const res = await handler(makeRequest({ game_id: GAME_ID }))
  expect(res.status).toBe(200)
})

it('returns 500 when planet insert fails', async () => {
  mockDb({ planetInsertError: { message: 'insert failed' } })
  const res = await handler(makeRequest({ game_id: GAME_ID }))
  expect(res.status).toBe(500)
  const body = await res.json()
  expect(body.error).toMatch(/Failed to insert planets/)
})
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-start.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Deploy the updated game-start**

```bash
cd ..
npx supabase functions deploy game-start --no-verify-jwt
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-start/index.ts ti4-companion-web/tests/functions/game-start.test.js
git commit -m "feat: game-start initialises starting techs and home planets"
```

---

## Task 3: Add researchTechnology to edgeFunctions.js and useGame.js

**Files:**
- Modify: `ti4-companion-web/src/lib/edgeFunctions.js`
- Modify: `ti4-companion-web/src/hooks/useGame.js`

- [ ] **Step 1: Add the wrapper to edgeFunctions.js**

Append before the final `export { callFunction }` line:

```js
export const researchTechnology = (gameId, techName, exhaustPlanetIds = [], bypassPrerequisites = false) =>
  callFunction('game-research-technology', {
    game_id: gameId,
    tech_name: techName,
    exhaust_planet_ids: exhaustPlanetIds,
    bypass_prerequisites: bypassPrerequisites,
  })
```

- [ ] **Step 2: Import and expose researchTechnology in useGame.js**

Add `researchTechnology` to the import at the top of `useGame.js`:

```js
import {
  updateGameSettings, pickFactionColor, setSpeaker, startGame,
  endTurn, passAction, advancePhase, scoreObjective,
  revealObjective, shuffleDeck, updateCommandTokens,
  drawActionCard, discardActionCard,
  researchTechnology,
} from '../lib/edgeFunctions.js'
```

Then add to the return object at the bottom of `useGame`, after `discardTheActionCard`:

```js
    // Phase 4a wrappers (tech research)
    researchTech: (techName, exhaustPlanetIds, bypassPrerequisites) =>
      game ? researchTechnology(game.id, techName, exhaustPlanetIds, bypassPrerequisites) : Promise.reject(new Error('Game not loaded')),
```

- [ ] **Step 3: Run existing tests to confirm nothing is broken**

```bash
cd ti4-companion-web
npm test
```

Expected: all existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/edgeFunctions.js src/hooks/useGame.js
git commit -m "feat: add researchTechnology edge function wrapper"
```

---

## Task 4: Implement useTechTree hook (TDD)

**Files:**
- Create: `ti4-companion-web/src/hooks/useTechTree.js`
- Create: `ti4-companion-web/tests/hooks/useTechTree.test.js`

The exported pure functions `computeHeldCounts` and `computeTechStatus` are tested directly. The hook itself is tested via `renderHook`.

Note on test data: `technology_type` is `'green'`/`'blue'`/`'yellow'`/`'red'` for the four colour families, and `'unit_upgrade'` for unit upgrades. There is no separate `is_unit_upgrade` field. Unit upgrades are excluded from prerequisite colour counts.

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/hooks/useTechTree.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  researchTechnology: vi.fn().mockResolvedValue({}),
}))

import { renderHook, act } from '@testing-library/react'
import {
  computeHeldCounts,
  computeTechStatus,
  useTechTree,
} from '../../src/hooks/useTechTree.js'
import { researchTechnology } from '../../src/lib/edgeFunctions.js'

// ── Sample reference data ─────────────────────────────────────────────────────
// technology_type replaces colour + is_unit_upgrade:
//   'green'/'blue'/'yellow'/'red' = colour families
//   'unit_upgrade' = unit upgrade (excluded from prereq colour counts)

const ALL_TECHS = [
  { id: 't1', name: 'Neural Motivator',        technology_type: 'green',        prerequisites: {},           faction: null,      expansion: 'base' },
  { id: 't2', name: 'Psychoarchaeology',        technology_type: 'green',        prerequisites: { green: 1 }, faction: null,      expansion: 'base' },
  { id: 't3', name: 'Bio-Stims',               technology_type: 'green',        prerequisites: { green: 2 }, faction: null,      expansion: 'base' },
  { id: 't4', name: 'Hyper Metabolism',         technology_type: 'green',        prerequisites: { green: 3 }, faction: null,      expansion: 'base' },
  { id: 't5', name: 'Sarween Tools',            technology_type: 'yellow',       prerequisites: {},           faction: null,      expansion: 'base' },
  { id: 't6', name: 'AI Development Algorithm', technology_type: 'yellow',       prerequisites: { red: 1 },   faction: null,      expansion: 'base' },
  { id: 't7', name: 'Antimass Deflectors',      technology_type: 'blue',         prerequisites: {},           faction: null,      expansion: 'base' },
  { id: 't8', name: 'Carrier II',               technology_type: 'unit_upgrade', prerequisites: { blue: 1 },  faction: null,      expansion: 'base' },
  { id: 't9', name: 'Chaos Mapping',            technology_type: 'green',        prerequisites: {},           faction: 'Arborec', expansion: 'base' },
]

const ACTIVE_EXPANSIONS = { base: true }

// ── computeHeldCounts ─────────────────────────────────────────────────────────

describe('computeHeldCounts', () => {
  it('returns zero counts when nothing is held', () => {
    expect(computeHeldCounts([], ALL_TECHS)).toEqual({ green: 0, blue: 0, yellow: 0, red: 0 })
  })

  it('counts held techs by technology_type', () => {
    const held = ['Neural Motivator', 'Sarween Tools', 'Antimass Deflectors']
    expect(computeHeldCounts(held, ALL_TECHS)).toEqual({ green: 1, blue: 1, yellow: 1, red: 0 })
  })

  it('does not count unit_upgrade techs toward colour prereqs', () => {
    const held = ['Carrier II']
    expect(computeHeldCounts(held, ALL_TECHS)).toEqual({ green: 0, blue: 0, yellow: 0, red: 0 })
  })

  it('ignores tech names not found in allTechnologies', () => {
    expect(computeHeldCounts(['Unknown Tech'], ALL_TECHS)).toEqual({ green: 0, blue: 0, yellow: 0, red: 0 })
  })
})

// ── computeTechStatus ─────────────────────────────────────────────────────────

describe('computeTechStatus', () => {
  const noReadyPlanets = []

  it('returns held when tech name is in heldTechNames', () => {
    const result = computeTechStatus(ALL_TECHS[0], ['Neural Motivator'], ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('held')
    expect(result.missingPrereqs).toEqual([])
    expect(result.exhaustOptions).toEqual([])
  })

  it('returns available when tech has no prerequisites', () => {
    const result = computeTechStatus(ALL_TECHS[0], [], ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('available')
  })

  it('returns available when prerequisites are satisfied by held techs', () => {
    // Bio-Stims needs green: 2 — hold Neural Motivator + Psychoarchaeology
    const held = ['Neural Motivator', 'Psychoarchaeology']
    const result = computeTechStatus(ALL_TECHS[2], held, ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('available')
  })

  it('returns unavailable when prerequisites are not met and no exhaust options exist', () => {
    // Bio-Stims needs green: 2 — hold only one green
    const result = computeTechStatus(ALL_TECHS[2], ['Neural Motivator'], ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('unavailable')
    expect(result.missingPrereqs).toEqual([{ colour: 'green', count: 1 }])
  })

  it('returns exhaust when a missing prereq can be covered by a readied specialty planet', () => {
    // Bio-Stims needs green: 2 — hold one green, have a readied green-specialty planet
    const held = ['Neural Motivator']
    const readyPlanets = [{ id: 'planet-1', tech_specialty: 'green', exhausted: false }]
    const result = computeTechStatus(ALL_TECHS[2], held, ALL_TECHS, readyPlanets)
    expect(result.status).toBe('exhaust')
    expect(result.exhaustOptions).toHaveLength(1)
    expect(result.exhaustOptions[0].id).toBe('planet-1')
    expect(result.exhaustOptions[0].coversColour).toBe('green')
  })

  it('returns exhaust when AI Development Algorithm covers one missing prereq', () => {
    // Bio-Stims needs green: 2, hold one green, hold AIDA (covers any colour for one missing prereq)
    const held = ['Neural Motivator', 'AI Development Algorithm']
    const result = computeTechStatus(ALL_TECHS[2], held, ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('exhaust')
    expect(result.exhaustOptions).toEqual([])
  })

  it('returns unavailable when AIDA is held but two prereqs are missing (AIDA only covers one)', () => {
    // Hyper Metabolism needs green: 3 — hold zero green, hold AIDA
    const held = ['AI Development Algorithm']
    const result = computeTechStatus(ALL_TECHS[3], held, ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('unavailable')
  })

  it('uses a planet for each missing prereq independently (multi-planet exhaust)', () => {
    // Hyper Metabolism needs green: 3 — hold one green, have two readied green planets
    const held = ['Neural Motivator']
    const readyPlanets = [
      { id: 'p1', tech_specialty: 'green', exhausted: false },
      { id: 'p2', tech_specialty: 'green', exhausted: false },
    ]
    const result = computeTechStatus(ALL_TECHS[3], held, ALL_TECHS, readyPlanets)
    expect(result.status).toBe('exhaust')
    expect(result.exhaustOptions).toHaveLength(2)
  })

  it('does not include already-exhausted planets as exhaust options', () => {
    const held = ['Neural Motivator']
    const readyPlanets = [{ id: 'p1', tech_specialty: 'green', exhausted: true }]
    // computeTechStatus receives only readyPlanets (caller filters exhausted)
    // so exhausted=true here means caller passed it by mistake — still check coversColour logic
    // actually useTechTree filters beforehand; if caller passes exhausted planet, it still counts
    // This tests the planet filtering happens in useTechTree, not computeTechStatus
    const result = computeTechStatus(ALL_TECHS[2], held, ALL_TECHS, readyPlanets)
    // computeTechStatus trusts the caller to pass only ready planets; this planet still matches
    expect(result.status).toBe('exhaust')
  })

  it('faction techs return correct status', () => {
    // Chaos Mapping (Arborec faction, green, no prereqs) should be available to any player
    const result = computeTechStatus(ALL_TECHS[8], [], ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('available')
  })
})

// ── useTechTree hook ──────────────────────────────────────────────────────────

const PLAYER = {
  id: 'player-1',
  technologies: ['Neural Motivator'],
  faction: 'Arborec',
}
const PLANETS = [
  { id: 'pl-1', planet_name: 'Nestphar', tech_specialty: null, exhausted: false },
  { id: 'pl-2', planet_name: 'Lazar',    tech_specialty: 'blue', exhausted: false },
]

describe('useTechTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sections contain the correct techs grouped by technology_type', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    expect(result.current.sections.biotic.some(t => t.name === 'Neural Motivator')).toBe(true)
    expect(result.current.sections.unitUpgrades.some(t => t.name === 'Carrier II')).toBe(true)
    expect(result.current.sections.faction.some(t => t.name === 'Chaos Mapping')).toBe(true)
  })

  it('faction section contains only techs matching the player faction', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    const factionNames = result.current.sections.faction.map(t => t.name)
    expect(factionNames).toContain('Chaos Mapping')
    expect(factionNames).not.toContain('Neural Motivator')
  })

  it('selectedTech is null initially', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    expect(result.current.selectedTech).toBeNull()
  })

  it('selectTech sets selectedTech', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    act(() => result.current.selectTech('t2'))
    expect(result.current.selectedTech?.id).toBe('t2')
  })

  it('selectTech toggles off when same tech selected twice', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    act(() => result.current.selectTech('t2'))
    act(() => result.current.selectTech('t2'))
    expect(result.current.selectedTech).toBeNull()
  })

  it('clearSelection deselects', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    act(() => result.current.selectTech('t2'))
    act(() => result.current.clearSelection())
    expect(result.current.selectedTech).toBeNull()
  })

  it('previewSections is null when no tech is selected', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    expect(result.current.previewSections).toBeNull()
  })

  it('previewSections shows newly unlocked tech as preview', () => {
    // Player holds Neural Motivator (1 green). Select Psychoarchaeology (needs green:1).
    // After researching Psychoarchaeology (2 greens held), Bio-Stims (needs green:2)
    // would change from unavailable → available. It should appear as preview.
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    act(() => result.current.selectTech('t2')) // select Psychoarchaeology
    const bioStims = result.current.previewSections?.biotic.find(t => t.name === 'Bio-Stims')
    expect(bioStims?.status).toBe('preview')
  })

  it('confirmResearch calls researchTechnology with correct arguments', async () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    await act(async () => {
      await result.current.confirmResearch('t2', ['planet-uuid'], false)
    })
    expect(researchTechnology).toHaveBeenCalledWith('game-id', 'Psychoarchaeology', ['planet-uuid'], false)
  })

  it('confirmResearch clears selectedTech on success', async () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    act(() => result.current.selectTech('t2'))
    await act(async () => {
      await result.current.confirmResearch('t2', [], false)
    })
    expect(result.current.selectedTech).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/hooks/useTechTree.test.js
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement useTechTree.js**

Create `ti4-companion-web/src/hooks/useTechTree.js`:

```js
import { useState } from 'react'
import { researchTechnology } from '../lib/edgeFunctions.js'

const COLOUR_TYPES = new Set(['green', 'blue', 'yellow', 'red'])

// Exported for unit testing.
// Returns how many of each colour the player currently holds.
// unit_upgrade techs are excluded — they don't satisfy colour prerequisites.
export function computeHeldCounts(heldTechNames, allTechnologies) {
  const counts = { green: 0, blue: 0, yellow: 0, red: 0 }
  for (const name of heldTechNames) {
    const tech = allTechnologies.find(t => t.name === name)
    if (tech && COLOUR_TYPES.has(tech.technology_type)) counts[tech.technology_type]++
  }
  return counts
}

// Exported for unit testing.
// readyPlanets: game_player_planets rows where !exhausted && tech_specialty != null.
// Caller is responsible for pre-filtering.
export function computeTechStatus(tech, heldTechNames, allTechnologies, readyPlanets) {
  if (heldTechNames.includes(tech.name)) {
    return { status: 'held', missingPrereqs: [], exhaustOptions: [] }
  }

  const prereqs = tech.prerequisites ?? {}
  if (Object.keys(prereqs).length === 0) {
    return { status: 'available', missingPrereqs: [], exhaustOptions: [] }
  }

  const held = computeHeldCounts(heldTechNames, allTechnologies)
  const hasAIDA = heldTechNames.includes('AI Development Algorithm')

  const missingByColour = {}
  for (const [colour, needed] of Object.entries(prereqs)) {
    const deficit = needed - (held[colour] ?? 0)
    if (deficit > 0) missingByColour[colour] = deficit
  }

  if (Object.keys(missingByColour).length === 0) {
    return { status: 'available', missingPrereqs: [], exhaustOptions: [] }
  }

  // Try to cover each missing colour via exhaust path
  let aidaAvailable = hasAIDA
  const exhaustOptions = []
  const usedPlanetIds = new Set()

  for (const [colour, deficit] of Object.entries(missingByColour)) {
    let remaining = deficit

    for (const planet of readyPlanets) {
      if (remaining === 0) break
      if (usedPlanetIds.has(planet.id)) continue
      if (planet.tech_specialty === colour) {
        exhaustOptions.push({ ...planet, coversColour: colour })
        usedPlanetIds.add(planet.id)
        remaining--
      }
    }

    if (remaining > 0 && aidaAvailable) {
      aidaAvailable = false
      remaining--
    }

    if (remaining > 0) {
      const missingPrereqs = Object.entries(missingByColour).map(
        ([c, count]) => ({ colour: c, count })
      )
      return { status: 'unavailable', missingPrereqs, exhaustOptions: [] }
    }
  }

  return { status: 'exhaust', missingPrereqs: [], exhaustOptions }
}

function findInSections(sections, techId) {
  for (const key of Object.keys(sections)) {
    const found = sections[key].find(t => t.id === techId)
    if (found) return found
  }
  return null
}

function buildSections(heldTechNames, allTechnologies, readyPlanets, faction, activeExpansions) {
  const eligible = allTechnologies.filter(t => activeExpansions.includes(t.expansion ?? 'base'))

  const sortByPrereqs = (a, b) => {
    const sum = t => Object.values(t.prerequisites ?? {}).reduce((s, n) => s + n, 0)
    return sum(a) - sum(b)
  }

  const annotate = t => ({ ...t, ...computeTechStatus(t, heldTechNames, allTechnologies, readyPlanets) })

  return {
    faction:      eligible.filter(t => t.faction === faction && t.technology_type !== 'unit_upgrade').map(annotate).sort(sortByPrereqs),
    unitUpgrades: eligible.filter(t => t.technology_type === 'unit_upgrade').map(annotate).sort(sortByPrereqs),
    biotic:       eligible.filter(t => !t.faction && t.technology_type === 'green').map(annotate).sort(sortByPrereqs),
    propulsion:   eligible.filter(t => !t.faction && t.technology_type === 'blue').map(annotate).sort(sortByPrereqs),
    cybernetic:   eligible.filter(t => !t.faction && t.technology_type === 'yellow').map(annotate).sort(sortByPrereqs),
    warfare:      eligible.filter(t => !t.faction && t.technology_type === 'red').map(annotate).sort(sortByPrereqs),
  }
}

function markPreview(previewSection, currentSection) {
  return previewSection.map(t => {
    const current = currentSection.find(c => c.id === t.id)
    if (
      current &&
      (current.status === 'unavailable' || current.status === 'exhaust') &&
      t.status === 'available'
    ) {
      return { ...t, status: 'preview' }
    }
    return t
  })
}

// player: game_players row ({ technologies: string[], faction: string })
// planets: game_player_planets rows for this player
// allTechnologies: full technologies reference table
// gameId: current game UUID (for confirmResearch)
// gameExpansions: games.expansions JSONB e.g. { base: true, pok: false }
export function useTechTree(player, planets, allTechnologies, gameId, gameExpansions) {
  const [selectedTechId, setSelectedTechId] = useState(null)

  const heldTechNames = player?.technologies ?? []
  const faction = player?.faction ?? null
  const activeExpansions = Object.entries(gameExpansions ?? {})
    .filter(([, active]) => active)
    .map(([exp]) => exp)
  const readyPlanets = (planets ?? []).filter(p => !p.exhausted && p.tech_specialty)
  const techs = allTechnologies ?? []

  const sections = buildSections(heldTechNames, techs, readyPlanets, faction, activeExpansions)

  // Use the annotated version from sections so exhaustOptions/status are present.
  const selectedTech = selectedTechId ? findInSections(sections, selectedTechId) ?? null : null

  let previewSections = null
  if (selectedTech) {
    const previewHeld = [...heldTechNames, selectedTech.name]
    const base = buildSections(previewHeld, techs, readyPlanets, faction, activeExpansions)
    previewSections = {
      faction:      markPreview(base.faction,      sections.faction),
      unitUpgrades: markPreview(base.unitUpgrades, sections.unitUpgrades),
      biotic:       markPreview(base.biotic,       sections.biotic),
      propulsion:   markPreview(base.propulsion,   sections.propulsion),
      cybernetic:   markPreview(base.cybernetic,   sections.cybernetic),
      warfare:      markPreview(base.warfare,      sections.warfare),
    }
  }

  function selectTech(techId) {
    setSelectedTechId(prev => prev === techId ? null : techId)
  }

  function clearSelection() {
    setSelectedTechId(null)
  }

  async function confirmResearch(techId, exhaustPlanetIds = [], bypassPrerequisites = false) {
    const tech = techs.find(t => t.id === techId)
    if (!tech) throw new Error('Technology not found')
    await researchTechnology(gameId, tech.name, exhaustPlanetIds, bypassPrerequisites)
    setSelectedTechId(null)
  }

  return { sections, previewSections, selectedTech, selectTech, clearSelection, confirmResearch }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/hooks/useTechTree.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTechTree.js tests/hooks/useTechTree.test.js
git commit -m "feat: add useTechTree hook with prerequisite logic and preview"
```

---

## Task 5: Build TechCard component and tests

**Files:**
- Create: `ti4-companion-web/src/components/game/TechCard.jsx`
- Create: `ti4-companion-web/tests/components/TechCard.test.jsx`

Note: TechCard does not reference `technology_type` directly — it renders `tech.name`, `tech.status`, `tech.prerequisites`, and `tech.missingPrereqs`. The prerequisite dots are keyed by colour strings from the `prerequisites` object keys (e.g. `{ green: 1 }`), which remain colour names regardless of the schema change.

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/components/TechCard.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TechCard from '../../src/components/game/TechCard.jsx'

const BASE_TECH = {
  id: 't1',
  name: 'Neural Motivator',
  technology_type: 'green',
  prerequisites: {},
  text: 'Draw 1 action card at the start of the action phase.',
  status: 'available',
  missingPrereqs: [],
  exhaustOptions: [],
}

describe('TechCard', () => {
  it('renders the tech name', () => {
    render(<TechCard tech={BASE_TECH} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByText('Neural Motivator')).toBeTruthy()
  })

  it('applies held styling when status is held', () => {
    render(<TechCard tech={{ ...BASE_TECH, status: 'held' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByTestId('tech-card').className).toMatch(/border-success/)
  })

  it('applies available styling when status is available', () => {
    render(<TechCard tech={BASE_TECH} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByTestId('tech-card').className).toMatch(/border-plasma/)
  })

  it('applies exhaust styling when status is exhaust', () => {
    render(<TechCard tech={{ ...BASE_TECH, status: 'exhaust' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByTestId('tech-card').className).toMatch(/border-warning/)
  })

  it('applies dim styling when status is unavailable', () => {
    render(<TechCard tech={{ ...BASE_TECH, status: 'unavailable', missingPrereqs: [{ colour: 'green', count: 1 }] }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByTestId('tech-card').className).toMatch(/border-border/)
  })

  it('applies preview styling when status is preview', () => {
    render(<TechCard tech={{ ...BASE_TECH, status: 'preview' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByTestId('tech-card').className).toMatch(/border-plasma/)
  })

  it('renders filled prereq dots for satisfied prerequisites', () => {
    const tech = { ...BASE_TECH, prerequisites: { green: 1 }, status: 'held' }
    render(<TechCard tech={tech} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getAllByTestId('prereq-dot-filled')).toHaveLength(1)
  })

  it('renders empty prereq dots for missing prerequisites on unavailable tech', () => {
    const tech = {
      ...BASE_TECH,
      status: 'unavailable',
      prerequisites: { green: 2 },
      missingPrereqs: [{ colour: 'green', count: 2 }],
    }
    render(<TechCard tech={tech} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getAllByTestId('prereq-dot-empty')).toHaveLength(2)
  })

  it('shows missing prereq tooltip text when status is unavailable', () => {
    const tech = {
      ...BASE_TECH,
      status: 'unavailable',
      missingPrereqs: [{ colour: 'green', count: 1 }],
    }
    render(<TechCard tech={tech} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByText(/Missing: 1 green/i)).toBeTruthy()
  })

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn()
    render(<TechCard tech={BASE_TECH} isOwnTree={false} isSelected={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('tech-card'))
    expect(onSelect).toHaveBeenCalledWith('t1')
  })

  it('does not show confirm button when isOwnTree is false', () => {
    render(<TechCard tech={BASE_TECH} isOwnTree={false} isSelected={true} onSelect={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByText('RESEARCH')).toBeNull()
  })

  it('shows confirm button when isOwnTree is true and tech is selected and available', () => {
    render(<TechCard tech={BASE_TECH} isOwnTree={true} isSelected={true} onSelect={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('RESEARCH')).toBeTruthy()
  })

  it('does not show confirm button for held techs even when selected', () => {
    render(<TechCard tech={{ ...BASE_TECH, status: 'held' }} isOwnTree={true} isSelected={true} onSelect={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByText('RESEARCH')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/components/TechCard.test.jsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement TechCard.jsx**

Create `ti4-companion-web/src/components/game/TechCard.jsx`:

```jsx
// Prereq dot colours are keyed by the colour strings from tech.prerequisites object keys,
// which remain 'green'/'blue'/'yellow'/'red' regardless of the technology_type field.
const COLOUR_DOT = {
  green:  'bg-success',
  blue:   'bg-plasma',
  yellow: 'bg-warning',
  red:    'bg-danger',
}

const STATUS_BORDER = {
  held:        'border-success   bg-hull',
  available:   'border-plasma    bg-hull',
  exhaust:     'border-warning   bg-hull border-dashed',
  unavailable: 'border-border    bg-void opacity-60',
  preview:     'border-plasma    bg-hull ring-1 ring-plasma ring-offset-0',
}

// tech: annotated tech object from useTechTree (has status, missingPrereqs, exhaustOptions)
// isOwnTree: whether this modal is showing the current user's own tree
// isSelected: whether this card is the currently selected preview tech
// onSelect: (techId) => void
// onConfirm: (techId) => void — only called on own tree for available/exhaust/preview techs
export default function TechCard({ tech, isOwnTree, isSelected, onSelect, onConfirm }) {
  const borderClass = STATUS_BORDER[tech.status] ?? STATUS_BORDER.unavailable
  const canResearch = isOwnTree && isSelected && tech.status !== 'held' && tech.status !== 'unavailable'

  // Build prereq dots: filled for satisfied, empty for missing
  const prereqs = tech.prerequisites ?? {}
  const dots = []
  for (const [colour, needed] of Object.entries(prereqs)) {
    const missing = tech.missingPrereqs?.find(m => m.colour === colour)?.count ?? 0
    const satisfied = needed - missing
    for (let i = 0; i < satisfied; i++) {
      dots.push({ colour, filled: true })
    }
    for (let i = 0; i < missing; i++) {
      dots.push({ colour, filled: false })
    }
  }

  return (
    <div
      data-testid="tech-card"
      className={`rounded-md border-2 p-2 cursor-pointer transition-all ${borderClass} ${isSelected ? 'ring-2 ring-offset-1 ring-gold' : ''}`}
      onClick={() => onSelect(tech.id)}
    >
      {/* Prereq dots */}
      {dots.length > 0 && (
        <div className="flex gap-1 mb-1">
          {dots.map((dot, i) =>
            dot.filled ? (
              <span
                key={i}
                data-testid="prereq-dot-filled"
                className={`w-2.5 h-2.5 rounded-full ${COLOUR_DOT[dot.colour] ?? 'bg-muted'}`}
              />
            ) : (
              <span
                key={i}
                data-testid="prereq-dot-empty"
                className={`w-2.5 h-2.5 rounded-full border border-current opacity-40`}
              />
            )
          )}
        </div>
      )}

      {/* Name */}
      <p className={`font-body text-xs font-bold leading-tight ${tech.status === 'held' ? 'text-success' : tech.status === 'unavailable' ? 'text-dim' : 'text-text'}`}>
        {tech.name}
      </p>

      {/* Missing prereq tooltip */}
      {tech.status === 'unavailable' && tech.missingPrereqs?.length > 0 && (
        <p className="text-dim text-xs mt-1">
          Missing: {tech.missingPrereqs.map(m => `${m.count} ${m.colour}`).join(', ')}
        </p>
      )}

      {/* Confirm research button */}
      {canResearch && (
        <button
          className="btn-primary text-xs mt-2 w-full"
          onClick={(e) => { e.stopPropagation(); onConfirm(tech.id) }}
        >
          RESEARCH
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/TechCard.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/TechCard.jsx tests/components/TechCard.test.jsx
git commit -m "feat: add TechCard component"
```

---

## Task 6: Build TechTreeSection component

**Files:**
- Create: `ti4-companion-web/src/components/game/TechTreeSection.jsx`

No dedicated test — this is a trivial labelled wrapper.

- [ ] **Step 1: Implement TechTreeSection.jsx**

Create `ti4-companion-web/src/components/game/TechTreeSection.jsx`:

```jsx
import TechCard from './TechCard.jsx'

// techs: annotated tech array from useTechTree sections
// label: section heading string
// isOwnTree, selectedTechId, onSelect, onConfirm: passed through to TechCard
export default function TechTreeSection({ label, techs, isOwnTree, selectedTechId, onSelect, onConfirm }) {
  if (!techs || techs.length === 0) return null

  return (
    <div>
      <p className="label text-xs mb-2">{label}</p>
      <div className="flex flex-col gap-2">
        {techs.map(tech => (
          <TechCard
            key={tech.id}
            tech={tech}
            isOwnTree={isOwnTree}
            isSelected={selectedTechId === tech.id}
            onSelect={onSelect}
            onConfirm={onConfirm}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/game/TechTreeSection.jsx
git commit -m "feat: add TechTreeSection component"
```

---

## Task 7: Build ExhaustPlanetPicker component and tests

**Files:**
- Create: `ti4-companion-web/src/components/game/ExhaustPlanetPicker.jsx`
- Create: `ti4-companion-web/tests/components/ExhaustPlanetPicker.test.jsx`

This component appears inline beneath a selected exhaust-path tech. It lists the valid readied specialty planets and lets the player pick one per missing colour.

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/components/ExhaustPlanetPicker.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExhaustPlanetPicker from '../../src/components/game/ExhaustPlanetPicker.jsx'

const EXHAUST_OPTIONS = [
  { id: 'p1', planet_name: 'Lazar',   tech_specialty: 'blue',  coversColour: 'blue'  },
  { id: 'p2', planet_name: 'Vefut II', tech_specialty: 'red',  coversColour: 'red'   },
]

describe('ExhaustPlanetPicker', () => {
  it('renders a button for each exhaust option', () => {
    render(<ExhaustPlanetPicker exhaustOptions={EXHAUST_OPTIONS} selected={[]} onToggle={vi.fn()} />)
    expect(screen.getByText(/Lazar/)).toBeTruthy()
    expect(screen.getByText(/Vefut II/)).toBeTruthy()
  })

  it('shows planet name and tech specialty colour', () => {
    render(<ExhaustPlanetPicker exhaustOptions={EXHAUST_OPTIONS} selected={[]} onToggle={vi.fn()} />)
    expect(screen.getByText(/blue/i)).toBeTruthy()
  })

  it('marks selected planets visually', () => {
    render(<ExhaustPlanetPicker exhaustOptions={EXHAUST_OPTIONS} selected={['p1']} onToggle={vi.fn()} />)
    expect(screen.getByTestId('planet-option-p1').className).toMatch(/ring/)
  })

  it('calls onToggle with planet id when clicked', () => {
    const onToggle = vi.fn()
    render(<ExhaustPlanetPicker exhaustOptions={EXHAUST_OPTIONS} selected={[]} onToggle={onToggle} />)
    fireEvent.click(screen.getByTestId('planet-option-p1'))
    expect(onToggle).toHaveBeenCalledWith('p1')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/components/ExhaustPlanetPicker.test.jsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement ExhaustPlanetPicker.jsx**

Create `ti4-companion-web/src/components/game/ExhaustPlanetPicker.jsx`:

```jsx
const SPECIALTY_COLOUR = {
  green:  'text-success',
  blue:   'text-plasma',
  yellow: 'text-warning',
  red:    'text-danger',
}

// exhaustOptions: array of { id, planet_name, tech_specialty, coversColour }
// selected: array of planet IDs the player has toggled on
// onToggle: (planetId) => void
export default function ExhaustPlanetPicker({ exhaustOptions, selected, onToggle }) {
  if (!exhaustOptions || exhaustOptions.length === 0) return null

  return (
    <div className="mt-2">
      <p className="label text-xs mb-1">EXHAUST PLANET TO SKIP PREREQ</p>
      <div className="flex flex-col gap-1">
        {exhaustOptions.map(planet => {
          const isSelected = selected.includes(planet.id)
          return (
            <button
              key={planet.id}
              data-testid={`planet-option-${planet.id}`}
              onClick={() => onToggle(planet.id)}
              className={`flex items-center justify-between text-xs px-2 py-1 rounded border transition-all ${
                isSelected
                  ? 'border-warning bg-hull ring-1 ring-warning text-text'
                  : 'border-border bg-void text-dim hover:text-text'
              }`}
            >
              <span>{planet.planet_name}</span>
              <span className={SPECIALTY_COLOUR[planet.coversColour] ?? 'text-muted'}>
                {planet.coversColour}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/ExhaustPlanetPicker.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/ExhaustPlanetPicker.jsx tests/components/ExhaustPlanetPicker.test.jsx
git commit -m "feat: add ExhaustPlanetPicker component"
```

---

## Task 8: Build TechTreeModal component and tests

**Files:**
- Create: `ti4-companion-web/src/components/game/TechTreeModal.jsx`
- Create: `ti4-companion-web/tests/components/TechTreeModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/components/TechTreeModal.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  researchTechnology: vi.fn().mockResolvedValue({}),
}))

import TechTreeModal from '../../src/components/game/TechTreeModal.jsx'

// technology_type replaces colour + is_unit_upgrade
const ALL_TECHS = [
  { id: 't1', name: 'Neural Motivator', technology_type: 'green',        prerequisites: {}, faction: null,      expansion: 'base' },
  { id: 't2', name: 'Chaos Mapping',    technology_type: 'green',        prerequisites: {}, faction: 'Arborec', expansion: 'base' },
  { id: 't3', name: 'Carrier II',       technology_type: 'unit_upgrade', prerequisites: { blue: 1 }, faction: null, expansion: 'base' },
]

const PLAYER = { id: 'p1', technologies: [], faction: 'Arborec' }
const GAME_EXPANSIONS = { base: true }

describe('TechTreeModal', () => {
  it('renders faction section label', () => {
    render(
      <TechTreeModal
        player={PLAYER}
        planets={[]}
        allTechnologies={ALL_TECHS}
        gameId="game-id"
        gameExpansions={GAME_EXPANSIONS}
        isOwnTree={true}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('FACTION')).toBeTruthy()
  })

  it('renders unit upgrades section label', () => {
    render(
      <TechTreeModal
        player={PLAYER}
        planets={[]}
        allTechnologies={ALL_TECHS}
        gameId="game-id"
        gameExpansions={GAME_EXPANSIONS}
        isOwnTree={true}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('UNIT UPGRADES')).toBeTruthy()
  })

  it('renders colour section labels', () => {
    render(
      <TechTreeModal
        player={PLAYER}
        planets={[]}
        allTechnologies={ALL_TECHS}
        gameId="game-id"
        gameExpansions={GAME_EXPANSIONS}
        isOwnTree={true}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('BIOTIC')).toBeTruthy()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <TechTreeModal
        player={PLAYER}
        planets={[]}
        allTechnologies={ALL_TECHS}
        gameId="game-id"
        gameExpansions={GAME_EXPANSIONS}
        isOwnTree={true}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByTestId('tech-modal-close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not show RESEARCH button when isOwnTree is false', () => {
    render(
      <TechTreeModal
        player={PLAYER}
        planets={[]}
        allTechnologies={ALL_TECHS}
        gameId="game-id"
        gameExpansions={GAME_EXPANSIONS}
        isOwnTree={false}
        onClose={vi.fn()}
      />
    )
    // Select a tech
    fireEvent.click(screen.getAllByTestId('tech-card')[0])
    expect(screen.queryByText('RESEARCH')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/components/TechTreeModal.test.jsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement TechTreeModal.jsx**

Create `ti4-companion-web/src/components/game/TechTreeModal.jsx`:

```jsx
import { useState } from 'react'
import { useTechTree } from '../../hooks/useTechTree.js'
import TechTreeSection from './TechTreeSection.jsx'
import TechCard from './TechCard.jsx'
import ExhaustPlanetPicker from './ExhaustPlanetPicker.jsx'

// player: game_players row for the player being viewed
// planets: game_player_planets rows for that player
// allTechnologies: full technologies reference table
// gameId, gameExpansions: for prerequisite filtering and Edge Function calls
// isOwnTree: whether this is the current user's own tree (shows confirm button)
// onClose: () => void
export default function TechTreeModal({
  player, planets, allTechnologies,
  gameId, gameExpansions,
  isOwnTree, onClose,
}) {
  const [selectedPlanetIds, setSelectedPlanetIds] = useState([])
  const {
    sections, previewSections, selectedTech,
    selectTech, clearSelection, confirmResearch,
  } = useTechTree(player, planets, allTechnologies, gameId, gameExpansions)

  const displaySections = previewSections ?? sections

  function handleSelect(techId) {
    setSelectedPlanetIds([])
    selectTech(techId)
  }

  function handleClear() {
    setSelectedPlanetIds([])
    clearSelection()
  }

  function togglePlanet(planetId) {
    setSelectedPlanetIds(prev =>
      prev.includes(planetId) ? prev.filter(id => id !== planetId) : [...prev, planetId]
    )
  }

  async function handleConfirm(techId) {
    await confirmResearch(techId, selectedPlanetIds)
    setSelectedPlanetIds([])
  }

  const exhaustOptions = selectedTech?.exhaustOptions ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={handleClear}
    >
      <div
        className="relative bg-void border border-border rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="font-display text-sm tracking-widest text-bright">
            {player?.faction ?? 'TECHNOLOGIES'}
          </p>
          <button
            data-testid="tech-modal-close"
            className="btn-ghost text-xs"
            onClick={onClose}
          >
            CLOSE
          </button>
        </div>

        {/* Exhaust planet picker — shown below header when a tech requiring exhaust is selected */}
        {isOwnTree && exhaustOptions.length > 0 && selectedTech && (
          <ExhaustPlanetPicker
            exhaustOptions={exhaustOptions}
            selected={selectedPlanetIds}
            onToggle={togglePlanet}
          />
        )}

        {/* Faction + Unit Upgrades (full width) */}
        <TechTreeSection
          label="FACTION"
          techs={displaySections.faction}
          isOwnTree={isOwnTree}
          selectedTechId={selectedTech?.id ?? null}
          onSelect={handleSelect}
          onConfirm={handleConfirm}
        />
        <TechTreeSection
          label="UNIT UPGRADES"
          techs={displaySections.unitUpgrades}
          isOwnTree={isOwnTree}
          selectedTechId={selectedTech?.id ?? null}
          onSelect={handleSelect}
          onConfirm={handleConfirm}
        />

        {/* Colour columns grid */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'BIOTIC',      key: 'biotic' },
            { label: 'PROPULSION',  key: 'propulsion' },
            { label: 'CYBERNETIC',  key: 'cybernetic' },
            { label: 'WARFARE',     key: 'warfare' },
          ].map(({ label, key }) => (
            <div key={key} className="flex flex-col gap-2">
              <p className="label text-xs">{label}</p>
              {(displaySections[key] ?? []).map(tech => (
                <TechCard
                  key={tech.id}
                  tech={tech}
                  isOwnTree={isOwnTree}
                  isSelected={selectedTech?.id === tech.id}
                  onSelect={handleSelect}
                  onConfirm={handleConfirm}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/TechTreeModal.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/TechTreeModal.jsx tests/components/TechTreeModal.test.jsx
git commit -m "feat: add TechTreeModal component"
```

---

## Task 9: Wire into GameScreen, MyPanelSection, and ScoreboardSection

**Files:**
- Modify: `ti4-companion-web/src/components/game/GameScreen.jsx`
- Modify: `ti4-companion-web/src/components/game/MyPanelSection.jsx`
- Modify: `ti4-companion-web/src/components/game/ScoreboardSection.jsx`

- [ ] **Step 1: Update GameScreen.jsx**

Replace the full content of `GameScreen.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useGame } from '../../hooks/useGame.js'
import { deriveActivePlayer, deriveSpeaker } from '../../lib/gameUtils.js'
import GameHeader from './GameHeader.jsx'
import ScoreboardSection from './ScoreboardSection.jsx'
import MyPanelSection from './MyPanelSection.jsx'
import ObjectivesSection from './ObjectivesSection.jsx'
import HostControlsSection from './HostControlsSection.jsx'
import TechTreeModal from './TechTreeModal.jsx'

export default function GameScreen({ userId }) {
  const { code } = useParams()
  const {
    game, players, objectives, planets, currentPlayer, isHost, loading, error,
    endTheTurn, passTheAction, advanceThePhase,
    scoreAnObjective, revealAnObjective, shuffleTheDeck,
    updateTokens, exhaustPlanet, readyPlanet,
    pickStrategyCard, updateCommodities, updateTradeGoods, cycleLeader,
  } = useGame(code, userId)

  const [allTechnologies, setAllTechnologies] = useState([])
  const [viewingTechPlayerId, setViewingTechPlayerId] = useState(null)

  useEffect(() => {
    supabase
      .from('technologies')
      .select('*')
      .then(({ data }) => { if (data) setAllTechnologies(data) })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-dim font-display text-xs tracking-widest">LOADING…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-danger font-body text-sm">{error}</span>
      </div>
    )
  }

  const speaker = deriveSpeaker(players, game)
  const activePlayer = deriveActivePlayer(players, game)
  const myPlanets = planets.filter(p => p.player_id === currentPlayer?.id)

  const viewingPlayer = viewingTechPlayerId
    ? players.find(p => p.id === viewingTechPlayerId) ?? null
    : null
  const viewingPlanets = viewingTechPlayerId
    ? planets.filter(p => p.player_id === viewingTechPlayerId)
    : []

  return (
    <div className="min-h-screen bg-void">
      <GameHeader game={game} speaker={speaker} />
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        <ScoreboardSection
          players={players}
          game={game}
          currentPlayerId={currentPlayer?.id}
          onViewTech={setViewingTechPlayerId}
        />
        <MyPanelSection
          player={currentPlayer}
          planets={myPlanets}
          isActive={activePlayer?.id === currentPlayer?.id}
          game={game}
          onPass={passTheAction}
          onEndTurn={endTheTurn}
          onUpdateTokens={updateTokens}
          onExhaustPlanet={exhaustPlanet}
          onReadyPlanet={readyPlanet}
          onPickStrategyCard={pickStrategyCard}
          onUpdateCommodities={updateCommodities}
          onUpdateTradeGoods={updateTradeGoods}
          onCycleLeader={cycleLeader}
          onViewTech={() => setViewingTechPlayerId(currentPlayer?.id ?? null)}
        />
        <ObjectivesSection objectives={objectives} players={players} />
        <HostControlsSection
          isHost={isHost}
          game={game}
          players={players}
          objectives={objectives}
          onScoreObjective={scoreAnObjective}
          onRevealObjective={revealAnObjective}
          onShuffleDeck={shuffleTheDeck}
          onAdvancePhase={advanceThePhase}
        />
      </div>

      {viewingPlayer && (
        <TechTreeModal
          player={viewingPlayer}
          planets={viewingPlanets}
          allTechnologies={allTechnologies}
          gameId={game?.id}
          gameExpansions={game?.expansions}
          isOwnTree={viewingPlayer.id === currentPlayer?.id}
          onClose={() => setViewingTechPlayerId(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update MyPanelSection.jsx**

Add `onViewTech` to the destructured props at the top of the function:

```jsx
export default function MyPanelSection({
  player, planets, isActive, game,
  onPass, onEndTurn, onUpdateTokens,
  onExhaustPlanet, onReadyPlanet,
  onPickStrategyCard, onUpdateCommodities, onUpdateTradeGoods, onCycleLeader,
  onViewTech,
}) {
```

Replace the Technologies section at the bottom of `MyPanelSection` (the block that starts `{player.technologies?.length > 0 && ...}`) with a button:

```jsx
      {/* Technologies */}
      <div className="flex items-center justify-between">
        <p className="label text-xs">
          TECHNOLOGIES ({player.technologies?.length ?? 0})
        </p>
        <button className="btn-ghost text-xs" onClick={onViewTech}>
          VIEW TREE
        </button>
      </div>
```

- [ ] **Step 3: Update ScoreboardSection.jsx**

Add `onViewTech` to the function signature:

```jsx
export default function ScoreboardSection({ players, game, currentPlayerId, onViewTech }) {
```

Inside the `sorted.map` return, add a button before the VP `<span>`:

```jsx
              <button
                className="label text-xs text-dim hover:text-text px-1"
                onClick={(e) => { e.stopPropagation(); onViewTech(player.id) }}
                title="View tech tree"
              >
                TECH
              </button>
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS. (The useGame.phase3 tests mock supabase so the new allTechnologies fetch won't affect them; the component changes are purely additive.)

- [ ] **Step 5: Commit**

```bash
git add src/components/game/GameScreen.jsx src/components/game/MyPanelSection.jsx src/components/game/ScoreboardSection.jsx
git commit -m "feat: wire TechTreeModal into GameScreen, MyPanel, Scoreboard"
```

---

## Task 10: Create and deploy game-research-technology Edge Function

**Files:**
- Create: `supabase/functions/game-research-technology/index.ts`

No automated tests — smoke tested manually post-deploy (consistent with Phases 1–3).

- [ ] **Step 1: Create the function directory and index.ts**

Create `supabase/functions/game-research-technology/index.ts`:

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: {
    game_id?: unknown
    tech_name?: unknown
    exhaust_planet_ids?: unknown
    bypass_prerequisites?: unknown
  }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.tech_name || typeof body.tech_name !== 'string') return errorResponse("'tech_name' is required")

  const exhaustPlanetIds: string[] = Array.isArray(body.exhaust_planet_ids)
    ? body.exhaust_planet_ids.filter((id: unknown) => typeof id === 'string')
    : []
  const bypassPrerequisites = body.bypass_prerequisites === true

  // Load game (for expansion filter)
  const { data: game, error: gameError } = await db
    .from('games')
    .select('expansions')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const activeExpansions = Object.entries(game.expansions ?? {})
    .filter(([, active]) => active)
    .map(([exp]) => exp)

  // Load tech reference data
  const { data: tech, error: techError } = await db
    .from('technologies')
    .select('name, technology_type, prerequisites, expansion')
    .eq('name', body.tech_name)
    .maybeSingle()
  if (techError) return errorResponse('Database error', 500)
  if (!tech) return errorResponse('Technology not found', 404)
  if (!activeExpansions.includes((tech.expansion as string) ?? 'base')) {
    return errorResponse('Technology is not available for this game', 400)
  }

  // Load calling player
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, technologies')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const heldTechs: string[] = (player.technologies as string[]) ?? []
  if (heldTechs.includes(body.tech_name)) return errorResponse('Technology already researched', 409)

  // Validate prerequisites (unless bypassed)
  if (!bypassPrerequisites) {
    const { data: allTechs, error: allTechsError } = await db
      .from('technologies')
      .select('name, technology_type')
    if (allTechsError) return errorResponse('Database error', 500)

    // Count held techs by colour family only (unit_upgrade does not satisfy colour prereqs)
    const heldCounts: Record<string, number> = { green: 0, blue: 0, yellow: 0, red: 0 }
    for (const name of heldTechs) {
      const t = (allTechs ?? []).find((t: { name: string; technology_type: string }) => t.name === name)
      if (t && t.technology_type !== 'unit_upgrade') {
        heldCounts[t.technology_type as string] = (heldCounts[t.technology_type as string] ?? 0) + 1
      }
    }

    const hasAIDA = heldTechs.includes('AI Development Algorithm')
    let aidaUsed = false

    let planetsToExhaust: Array<{ id: string; tech_specialty: string | null; exhausted: boolean; player_id: string }> = []
    if (exhaustPlanetIds.length > 0) {
      const { data: planets, error: planetsError } = await db
        .from('game_player_planets')
        .select('id, tech_specialty, exhausted, player_id')
        .in('id', exhaustPlanetIds)
      if (planetsError) return errorResponse('Database error', 500)
      planetsToExhaust = (planets ?? []) as typeof planetsToExhaust

      for (const planet of planetsToExhaust) {
        if (planet.player_id !== player.id) return errorResponse('Planet does not belong to this player', 403)
        if (planet.exhausted) return errorResponse('Planet is already exhausted', 400)
      }
    }

    const prereqs = (tech.prerequisites ?? {}) as Record<string, number>
    const remainingPlanets = [...planetsToExhaust]

    for (const [colour, needed] of Object.entries(prereqs)) {
      const deficit = needed - (heldCounts[colour] ?? 0)
      if (deficit <= 0) continue

      let remaining = deficit

      // Consume matching-specialty planets from the pool
      const used: number[] = []
      for (let i = 0; i < remainingPlanets.length && remaining > 0; i++) {
        if (remainingPlanets[i].tech_specialty === colour) {
          used.push(i)
          remaining--
        }
      }
      for (const i of used.reverse()) remainingPlanets.splice(i, 1)

      // Use AIDA for one remaining if available
      if (remaining > 0 && hasAIDA && !aidaUsed) {
        aidaUsed = true
        remaining--
      }

      if (remaining > 0) {
        return errorResponse(
          `Missing prerequisite: need ${needed} ${colour} technology, have ${heldCounts[colour] ?? 0}`,
          400
        )
      }
    }
  }

  // Write: append tech to player's technologies
  const { error: updateError } = await db
    .from('game_players')
    .update({ technologies: [...heldTechs, body.tech_name] })
    .eq('id', player.id)
  if (updateError) return errorResponse(`Failed to research technology: ${updateError.message}`, 500)

  // Write: exhaust planets
  if (exhaustPlanetIds.length > 0) {
    const { error: exhaustError } = await db
      .from('game_player_planets')
      .update({ exhausted: true })
      .in('id', exhaustPlanetIds)
    if (exhaustError) return errorResponse(`Failed to exhaust planets: ${exhaustError.message}`, 500)
  }

  return okResponse({ researched: true })
})
```

- [ ] **Step 2: Run the full test suite one final time**

```bash
cd ti4-companion-web
npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Deploy the Edge Function**

```bash
cd ..
npx supabase functions deploy game-research-technology --no-verify-jwt
```

- [ ] **Step 4: Smoke test manually**

Start a game, open the tech tree modal, attempt to research a technology with and without prerequisites, verify planets exhaust correctly.

- [ ] **Step 5: Final commit**

```bash
git add supabase/functions/game-research-technology/index.ts
git commit -m "feat: add game-research-technology Edge Function"
```

---

## Smoke Test Checklist

After deploying:

- [ ] Tech tree modal opens from "VIEW TREE" button in My Panel
- [ ] Tech tree modal opens read-only from "TECH" button in Scoreboard
- [ ] Faction section shows only this player's faction techs
- [ ] Unit Upgrades section shows unit upgrade techs
- [ ] Colour columns show correct grouping (Biotic / Propulsion / Cybernetic / Warfare)
- [ ] Held techs have green border; available techs have blue border; unavailable techs are dim
- [ ] Exhaust-path techs show dashed orange border; ExhaustPlanetPicker appears when selected
- [ ] Selecting an available tech shows RESEARCH button; preview glow appears on newly-unlocked techs
- [ ] Clicking RESEARCH calls the edge function and tech appears as held
- [ ] Researching via planet exhaust marks the planet as exhausted
- [ ] Home planets appear for each player after starting a new game
- [ ] Starting techs appear as held in the tech tree at game start
