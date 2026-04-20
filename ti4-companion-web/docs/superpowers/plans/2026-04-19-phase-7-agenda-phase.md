# Phase 7: Agenda Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the TI4 Agenda Phase — deck initialisation, real-time reverse-speaker-order voting, and hybrid structured/manual agenda resolution with persistent law tracking.

**Architecture:** Approach A from the spec — agenda phase step and current card live on `games` (picked up by the existing Realtime subscription); per-player votes live in a new `game_agenda_votes` table with its own Realtime subscription for live tallies. A shared `_shared/player-order.ts` helper handles ordered turn sequencing for both voting and future action-phase use. Resolution applies tractable effects automatically (award_vp, exhaust_planet, grant_tech); non-tractable laws record `host_applies_manually = true`.

**Tech Stack:** Deno/TypeScript (Edge Functions), React 19 + Tailwind CSS 3 (UI), Vitest + @testing-library/react (tests), Supabase JS v2 (client)

---

## File Map

**New — migrations:**
- `supabase/migrations/025_phase7.sql`

**New — shared helper:**
- `supabase/functions/_shared/player-order.ts`

**New — Edge Functions:**
- `supabase/functions/game-draw-agenda/index.ts`
- `supabase/functions/game-cast-votes/index.ts`
- `supabase/functions/game-resolve-agenda/index.ts`

**Modified — Edge Functions:**
- `supabase/functions/game-start/index.ts` — shuffle agenda deck on start
- `supabase/functions/admin-import-agendas/index.ts` — accept tractable + effect_json

**New — React components:**
- `src/components/game/PlanetSelectionModal.jsx`
- `src/components/game/VotingPanel.jsx`
- `src/components/game/AgendaSection.jsx`
- `src/components/game/AgendaResolutionModal.jsx`
- `src/components/game/EnactedLawsPanel.jsx`

**Modified — React:**
- `src/lib/edgeFunctions.js` — three new wrappers
- `src/lib/gameUtils.js` — `deriveAgendaVoter`, `isSpeaker`
- `src/hooks/useGame.js` — agenda state, votes subscription, laws fetch, action wrappers
- `src/components/game/GameScreen.jsx` — mount AgendaSection + EnactedLawsPanel
- `src/components/game/HostControlsSection.jsx` — Begin/End Agenda Phase buttons

**New — tests:**
- `tests/lib/player-order.test.js`
- `tests/functions/game-draw-agenda.test.js`
- `tests/functions/game-cast-votes.test.js`
- `tests/functions/game-resolve-agenda.test.js`
- `tests/functions/game-start.phase7.test.js`
- `tests/components/game/PlanetSelectionModal.test.jsx`
- `tests/components/game/VotingPanel.test.jsx`
- `tests/components/game/AgendaSection.test.jsx`
- `tests/components/game/AgendaResolutionModal.test.jsx`
- `tests/components/game/EnactedLawsPanel.test.jsx`

---

## Task 1: Migration 025_phase7.sql

**Files:**
- Create: `supabase/migrations/025_phase7.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ── games: agenda phase columns ───────────────────────────────────────────────
ALTER TABLE public.games
  ADD COLUMN agenda_phase_step           TEXT NOT NULL DEFAULT 'inactive'
    CHECK (agenda_phase_step IN ('inactive','agenda_1_voting','agenda_1_resolved','agenda_2_voting','done')),
  ADD COLUMN agenda_current_card_id      UUID REFERENCES public.agendas(id),
  ADD COLUMN agenda_vote_current_player_id UUID REFERENCES public.game_players(id),
  ADD COLUMN current_vote_sequence       INTEGER NOT NULL DEFAULT 0;

-- ── game_player_planets: add influence + resources ───────────────────────────
-- These values are stored at game-start from tiles.planets JSONB so that
-- game-cast-votes and PlanetSelectionModal can read them without joining tiles.
ALTER TABLE public.game_player_planets
  ADD COLUMN influence  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN resources  INTEGER NOT NULL DEFAULT 0;

-- ── game_agenda_deck: tighten state constraint ────────────────────────────────
-- Table already exists (003_agenda.sql). Column is named deck_position.
ALTER TABLE public.game_agenda_deck
  ADD CONSTRAINT game_agenda_deck_state_check
    CHECK (state IN ('deck','voting','enacted','repealed','discarded'));

-- ── game_agenda_votes ─────────────────────────────────────────────────────────
CREATE TABLE public.game_agenda_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  game_player_id  UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  agenda_id       UUID NOT NULL REFERENCES public.agendas(id),
  choice          TEXT,
  vote_count      INTEGER NOT NULL DEFAULT 0,
  abstained       BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (game_id, game_player_id, agenda_id)
);

-- ── game_laws ─────────────────────────────────────────────────────────────────
CREATE TABLE public.game_laws (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  agenda_id           UUID NOT NULL REFERENCES public.agendas(id),
  round_enacted       INTEGER NOT NULL,
  elected_target      TEXT,
  is_repealed         BOOLEAN NOT NULL DEFAULT false,
  host_applies_manually BOOLEAN NOT NULL DEFAULT false
);

-- ── agendas: resolution metadata ─────────────────────────────────────────────
ALTER TABLE public.agendas
  ADD COLUMN tractable   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN effect_json JSONB NOT NULL DEFAULT '{}';

-- effect_json shape for tractable agendas:
--   { "op": "award_vp",      "amount": 1 }          -- award VP to elected player
--   { "op": "remove_vp",     "amount": 1 }          -- remove VP from elected player
--   { "op": "exhaust_planet"                }        -- exhaust elected planet (any player)
--   { "op": "grant_tech",    "tech": "name" }        -- grant a specific tech to elected player
--   { "op": "no_effect"                     }        -- law tracked but no DB change needed
```

- [ ] **Step 2: Verify file is valid SQL (no syntax errors) by reading it back**

No automated check — review the file visually before proceeding.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/025_phase7.sql
git commit -m "feat: add migration 025_phase7 — agenda phase schema"
```

---

## Task 2: Update agendas admin import

**Files:**
- Modify: `supabase/functions/admin-import-agendas/index.ts`
- Modify: `src/lib/importSchemas.js`

- [ ] **Step 1: Read current admin-import-agendas**

Open `supabase/functions/admin-import-agendas/index.ts` and `src/lib/importSchemas.js` to understand current field list.

- [ ] **Step 2: Add tractable + effect_json to the import function**

In `admin-import-agendas/index.ts`, add `tractable` and `effect_json` to the upsert field mapping alongside existing fields (`name`, `type`, `outcome`, `elect_type`, `expansion`, `note`).

- [ ] **Step 3: Add tractable + effect_json to importSchemas.js**

In `src/lib/importSchemas.js`, in the `agendas` entry's `fields` array, add:
```js
{ name: 'tractable',   type: 'boolean', required: false, description: 'Whether the app can auto-resolve this agenda' },
{ name: 'effect_json', type: 'object',  required: false, description: 'Effect descriptor: { op, amount?, tech? }' },
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/admin-import-agendas/index.ts src/lib/importSchemas.js
git commit -m "feat: add tractable + effect_json to agendas import"
```

---

## Task 3: player-order.ts — TDD

**Files:**
- Create: `supabase/functions/_shared/player-order.ts`
- Create: `ti4-companion-web/tests/lib/player-order.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/lib/player-order.test.js
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { getNextPlayer } from '../../../supabase/functions/_shared/player-order.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'

const PLAYERS = [
  { id: 'p1', strategy_card: 1, created_at: '2024-01-01T00:00:00Z' },
  { id: 'p2', strategy_card: 3, created_at: '2024-01-01T00:01:00Z' },
  { id: 'p3', strategy_card: 2, created_at: '2024-01-01T00:02:00Z' },
]

function mockPlayers(players = PLAYERS) {
  db.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: players }),
    }),
  })
}

describe('getNextPlayer — initiative order', () => {
  it('returns the next player by strategy card ascending', async () => {
    mockPlayers()
    // p1=1, p3=2, p2=3 → after p1 comes p3
    const next = await getNextPlayer('game-1', 'p1', 'initiative', null, db)
    expect(next).toBe('p3')
  })

  it('wraps from last back to first', async () => {
    mockPlayers()
    // p2 is last (card 3) → wraps to p1 (card 1)
    const next = await getNextPlayer('game-1', 'p2', 'initiative', null, db)
    expect(next).toBe('p1')
  })
})

describe('getNextPlayer — reverse_speaker order', () => {
  // join order: p1, p2, p3 (by created_at)
  // speaker = p1 → reverse_speaker order: p2, p3, p1 (speaker votes last)
  it('returns the player after the speaker first', async () => {
    mockPlayers()
    // first voter is p2 (after speaker p1 in join order)
    const next = await getNextPlayer('game-1', 'p2', 'reverse_speaker', 'p1', db)
    expect(next).toBe('p3')
  })

  it('speaker votes last — next after p3 is speaker p1', async () => {
    mockPlayers()
    const next = await getNextPlayer('game-1', 'p3', 'reverse_speaker', 'p1', db)
    expect(next).toBe('p1')
  })

  it('wraps from speaker back to the first voter', async () => {
    mockPlayers()
    // after speaker p1 wraps to p2
    const next = await getNextPlayer('game-1', 'p1', 'reverse_speaker', 'p1', db)
    expect(next).toBe('p2')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ti4-companion-web && npx vitest run tests/lib/player-order.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement player-order.ts**

```typescript
// supabase/functions/_shared/player-order.ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type PlayerOrder = 'initiative' | 'reverse_speaker'

interface PlayerRow {
  id: string
  strategy_card: number | null
  created_at: string
}

export async function getNextPlayer(
  gameId: string,
  currentPlayerId: string,
  order: PlayerOrder,
  speakerPlayerId: string | null,
  db: SupabaseClient,
): Promise<string> {
  const { data: players } = await db
    .from('game_players')
    .select('id, strategy_card, created_at')
    .eq('game_id', gameId)

  const rows = (players ?? []) as PlayerRow[]

  let sorted: PlayerRow[]

  if (order === 'initiative') {
    sorted = [...rows].sort((a, b) => (a.seat_index ?? 999) - (b.seat_index ?? 999))
  } else {
    // reverse_speaker: sort by join order, rearrange so speaker is last
    const byJoin = [...rows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const speakerIdx = byJoin.findIndex(p => p.id === speakerPlayerId)
    // Order starting from player after speaker, speaker is last
    sorted = [
      ...byJoin.slice(speakerIdx + 1),
      ...byJoin.slice(0, speakerIdx + 1),
    ]
  }

  const currentIdx = sorted.findIndex(p => p.id === currentPlayerId)
  const nextIdx = (currentIdx + 1) % sorted.length
  return sorted[nextIdx].id
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/player-order.test.js
```
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/player-order.ts ti4-companion-web/tests/lib/player-order.test.js
git commit -m "feat: add player-order shared helper with initiative + reverse_speaker ordering"
```

---

## Task 4: Patch game-start — shuffle agenda deck

**Files:**
- Modify: `supabase/functions/game-start/index.ts`
- Create: `ti4-companion-web/tests/functions/game-start.phase7.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/functions/game-start.phase7.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { requireAuth } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'

const HOST_ID = 'host-uuid'
const GAME_ID = 'game-uuid'
const PLAYERS = [
  { id: 'p1', faction: 'Arborec', colour: 'green', display_name: 'Alice' },
]
const AGENDAS = [
  { id: 'ag-1', expansion: 'base' },
  { id: 'ag-2', expansion: 'base' },
  { id: 'ag-3', expansion: 'pok' },
]

function makeRequest(body) {
  return new Request('http://localhost/game-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let agendaInsertMock

function mockDb({ agendas = AGENDAS, insertAgendaError = null } = {}) {
  agendaInsertMock = vi.fn().mockResolvedValue({ error: insertAgendaError })

  db.from.mockImplementation((table) => {
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: 'sp-1', expansions: { base: true, pok: true } },
          error: null,
        }),
      })}),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
    if (table === 'game_players') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: PLAYERS, error: null }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
    if (table === 'public_objectives') return {
      select: vi.fn().mockReturnValue({ data: [], error: null }),
    }
    if (table === 'action_cards') return {
      select: vi.fn().mockReturnValue({ data: [], error: null }),
    }
    if (table === 'secret_objectives') return {
      select: vi.fn().mockReturnValue({ data: [
        { id: 'so-1', expansion: 'base' }, { id: 'so-2', expansion: 'base' },
      ], error: null }),
    }
    if (table === 'game_player_secret_objectives') return {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
    if (table === 'agendas') return {
      select: vi.fn().mockReturnValue({ data: agendas, error: null }),
    }
    if (table === 'game_agenda_deck') return {
      insert: agendaInsertMock,
    }
    if (table === 'factions') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { home_tile_number: null, starting_techs: [] }, error: null,
        }),
      })}),
    }
    return { select: vi.fn().mockReturnValue({ data: [], error: null }) }
  })
}

beforeEach(() => { vi.clearAllMocks(); mockDb(); requireAuth.mockResolvedValue(HOST_ID) })

describe('game-start phase7 — agenda deck', () => {
  it('inserts one row per eligible agenda into game_agenda_deck', async () => {
    const { default: handler } = await import('../../../supabase/functions/game-start/index.ts')
    // With pok active, all 3 agendas are eligible
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    const insertArg = agendaInsertMock.mock.calls[0][0]
    expect(insertArg).toHaveLength(3)
    expect(insertArg[0]).toMatchObject({ game_id: GAME_ID, state: 'deck' })
    expect(typeof insertArg[0].deck_position).toBe('number')
  })

  it('filters agendas by active expansions (base only)', async () => {
    db.from.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { host_user_id: HOST_ID, status: 'lobby', speaker_player_id: 'sp-1', expansions: { base: true, pok: false } },
          error: null,
        }),
      })}),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }))
    const { default: handler } = await import('../../../supabase/functions/game-start/index.ts')
    await handler(makeRequest({ game_id: GAME_ID }))
    const insertArg = agendaInsertMock.mock.calls[0]?.[0] ?? []
    // only base agendas (ag-1, ag-2)
    expect(insertArg).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/functions/game-start.phase7.test.js
```
Expected: FAIL — agenda deck insert not called.

- [ ] **Step 3: Also update the existing planet insert in game-start/index.ts**

The migration adds `influence` and `resources` to `game_player_planets`. Find the existing `game_player_planets` insert inside the player loop (around the `homePlanets.map` call) and add these two fields:

```typescript
              influence: p.influence ?? 0,
              resources: p.resources ?? 0,
```

The `tiles.planets` JSONB already contains `influence` and `resources` values — they just weren't being stored previously. The `homePlanets` type assertion should be extended to include them:

```typescript
      const homePlanets = (tile?.planets ?? []) as Array<{
        name: string
        tech_specialty?: string
        influence?: number
        resources?: number
      }>
```

- [ ] **Step 4: Add agenda deck initialisation to game-start/index.ts**

After the secret objectives block (before the player loop), add:

```typescript
  // Initialise agenda deck (filtered by active expansions)
  const { data: allAgendas, error: agendasError } = await db
    .from('agendas')
    .select('id, expansion')
  if (agendasError) return errorResponse('Database error', 500)

  const eligibleAgendas = (allAgendas ?? []).filter(
    (a: { id: string; expansion: string }) =>
      activeExpansions.includes(a.expansion ?? 'base')
  )

  if (eligibleAgendas.length > 0) {
    const agendaPositions = eligibleAgendas.map((_: unknown, i: number) => i)
    for (let i = agendaPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[agendaPositions[i], agendaPositions[j]] = [agendaPositions[j], agendaPositions[i]]
    }
    const { error: insertAgendasError } = await db
      .from('game_agenda_deck')
      .insert(
        eligibleAgendas.map((ag: { id: string }, i: number) => ({
          game_id: body.game_id,
          agenda_id: ag.id,
          deck_position: agendaPositions[i],
          state: 'deck',
        }))
      )
    if (insertAgendasError) return errorResponse(`Failed to initialise agenda deck: ${insertAgendasError.message}`, 500)
  }
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-start.phase7.test.js
```
Expected: 2 tests PASS.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
npm test
```
Expected: all existing tests still PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/game-start/index.ts ti4-companion-web/tests/functions/game-start.phase7.test.js
git commit -m "feat: initialise agenda deck in game-start; store planet influence + resources"
```

---

## Task 5: game-draw-agenda Edge Function — TDD

**Files:**
- Create: `supabase/functions/game-draw-agenda/index.ts`
- Create: `ti4-companion-web/tests/functions/game-draw-agenda.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/functions/game-draw-agenda.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))
vi.mock('../../../supabase/functions/_shared/player-order.ts', () => ({
  getNextPlayer: vi.fn().mockResolvedValue('p2'),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { getNextPlayer } from '../../../supabase/functions/_shared/player-order.ts'
import { handler } from '../../../supabase/functions/game-draw-agenda/index.ts'

const GAME_ID = 'game-uuid'
const SPEAKER_USER_ID = 'speaker-user-uuid'
const SPEAKER_PLAYER_ID = 'speaker-player-uuid'
const CARD_ID = 'agenda-card-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-draw-agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let updateGameMock, updateDeckMock

function mockDb({
  game = {
    id: GAME_ID,
    speaker_player_id: SPEAKER_PLAYER_ID,
    agenda_phase_step: 'agenda_1_voting',
    agenda_current_card_id: null,
    current_vote_sequence: 0,
  },
  callerPlayer = { id: SPEAKER_PLAYER_ID },
  topCard = { id: CARD_ID, agenda_id: 'ag-uuid', deck_position: 0 },
  updateGameError = null,
  updateDeckError = null,
} = {}) {
  updateGameMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateGameError }),
  })
  updateDeckMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateDeckError }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
        }),
      }),
      update: updateGameMock,
    }
    if (table === 'game_players') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
          }),
        }),
      }),
    }
    if (table === 'game_agenda_deck') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [topCard], error: null }),
            }),
          }),
        }),
      }),
      update: updateDeckMock,
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(SPEAKER_USER_ID)
})

describe('game-draw-agenda', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not the speaker', async () => {
    mockDb({ callerPlayer: { id: 'not-speaker' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 409 when a card is already in play', async () => {
    mockDb({ game: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_phase_step: 'agenda_1_voting', agenda_current_card_id: 'existing-card', current_vote_sequence: 0 } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 409 when step is inactive', async () => {
    mockDb({ game: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_phase_step: 'inactive', agenda_current_card_id: null, current_vote_sequence: 0 } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
  })

  it('sets deck row to voting and updates game on success', async () => {
    await handler(makeRequest({ game_id: GAME_ID }))
    expect(updateDeckMock).toHaveBeenCalledWith({ state: 'voting' })
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_current_card_id: 'ag-uuid',
      current_vote_sequence: 1,
    }))
  })

  it('advances step from agenda_1_resolved to agenda_2_voting', async () => {
    mockDb({ game: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_phase_step: 'agenda_1_resolved', agenda_current_card_id: null, current_vote_sequence: 1 } })
    await handler(makeRequest({ game_id: GAME_ID }))
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_phase_step: 'agenda_2_voting',
    }))
  })

  it('keeps step as agenda_1_voting when drawing first card', async () => {
    await handler(makeRequest({ game_id: GAME_ID }))
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_phase_step: 'agenda_1_voting',
    }))
  })

  it('sets agenda_vote_current_player_id from getNextPlayer', async () => {
    await handler(makeRequest({ game_id: GAME_ID }))
    expect(getNextPlayer).toHaveBeenCalled()
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_vote_current_player_id: 'p2',
    }))
  })

  it('returns 200 on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/functions/game-draw-agenda.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement game-draw-agenda/index.ts**

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { getNextPlayer } from '../_shared/player-order.ts'

export async function handler(req: Request): Promise<Response> {
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
    .select('id, speaker_player_id, agenda_phase_step, agenda_current_card_id, current_vote_sequence')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  // Verify caller is the speaker
  const { data: callerPlayer } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!callerPlayer || callerPlayer.id !== game.speaker_player_id) {
    return errorResponse('Only the speaker can draw the agenda', 403)
  }

  // Validate step allows drawing
  const validSteps = ['agenda_1_voting', 'agenda_1_resolved']
  if (!validSteps.includes(game.agenda_phase_step)) {
    return errorResponse(`Cannot draw agenda in step: ${game.agenda_phase_step}`, 409)
  }
  if (game.agenda_current_card_id) {
    return errorResponse('An agenda card is already in play', 409)
  }

  // Pull top deck card
  const { data: topCards, error: deckError } = await db
    .from('game_agenda_deck')
    .select('id, agenda_id, deck_position')
    .eq('game_id', body.game_id)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(1)
  if (deckError) return errorResponse('Database error', 500)
  const topCard = topCards?.[0]
  if (!topCard) return errorResponse('Agenda deck is empty', 409)

  // Mark card as voting
  const { error: deckUpdateError } = await db
    .from('game_agenda_deck')
    .update({ state: 'voting' })
    .eq('id', topCard.id)
  if (deckUpdateError) return errorResponse(`Failed to update deck: ${deckUpdateError.message}`, 500)

  // Get first voter (player after speaker in reverse speaker order)
  const firstVoterId = await getNextPlayer(body.game_id, game.speaker_player_id, 'reverse_speaker', game.speaker_player_id, db)

  // Advance step if coming from agenda_1_resolved
  const newStep = game.agenda_phase_step === 'agenda_1_resolved'
    ? 'agenda_2_voting'
    : game.agenda_phase_step

  const { error: gameUpdateError } = await db
    .from('games')
    .update({
      agenda_current_card_id: topCard.agenda_id,
      agenda_vote_current_player_id: firstVoterId,
      agenda_phase_step: newStep,
      current_vote_sequence: game.current_vote_sequence + 1,
    })
    .eq('id', body.game_id)
  if (gameUpdateError) return errorResponse(`Failed to update game: ${gameUpdateError.message}`, 500)

  return okResponse({ drawn: true, agenda_id: topCard.agenda_id })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/functions/game-draw-agenda.test.js
```
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-draw-agenda/index.ts ti4-companion-web/tests/functions/game-draw-agenda.test.js
git commit -m "feat: add game-draw-agenda Edge Function"
```

---

## Task 6: game-cast-votes Edge Function — TDD

**Files:**
- Create: `supabase/functions/game-cast-votes/index.ts`
- Create: `ti4-companion-web/tests/functions/game-cast-votes.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/functions/game-cast-votes.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))
vi.mock('../../../supabase/functions/_shared/player-order.ts', () => ({
  getNextPlayer: vi.fn().mockResolvedValue('p3'),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-cast-votes/index.ts'

const GAME_ID = 'game-uuid'
const VOTER_USER_ID = 'voter-user-uuid'
const VOTER_PLAYER_ID = 'p2'
const AGENDA_ID = 'agenda-uuid'
const SPEAKER_PLAYER_ID = 'p1'

function makeRequest(body) {
  return new Request('http://localhost/game-cast-votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let upsertVotesMock, updateGameMock

function mockDb({
  game = {
    id: GAME_ID,
    speaker_player_id: SPEAKER_PLAYER_ID,
    agenda_current_card_id: AGENDA_ID,
    agenda_vote_current_player_id: VOTER_PLAYER_ID,
  },
  callerPlayer = { id: VOTER_PLAYER_ID },
  planets = [
    { exhausted: false, influence: 3 },
    { exhausted: false, influence: 2 },
    { exhausted: true,  influence: 1 },
  ],
  existingVotes = [],
  totalPlayers = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
  upsertError = null,
  updateGameError = null,
} = {}) {
  upsertVotesMock = vi.fn().mockResolvedValue({ error: upsertError })
  updateGameMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateGameError }),
  })

  db.from.mockImplementation((table) => {
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
        }),
      }),
      update: updateGameMock,
    }
    if (table === 'game_players') return {
      select: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }),
          }),
          // for total players count
          then: undefined,
        }),
      })),
    }
    if (table === 'game_player_planets') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: planets, error: null }),
        }),
      }),
    }
    if (table === 'game_agenda_votes') return {
      upsert: upsertVotesMock,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: existingVotes, error: null }),
        }),
      }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(VOTER_USER_ID)
})

describe('game-cast-votes', () => {
  it('returns 401 for unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when it is not the caller\'s turn', async () => {
    mockDb({ callerPlayer: { id: 'p3' } }) // not the current voter
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(res.status).toBe(403)
  })

  it('returns 409 when no agenda is in play', async () => {
    mockDb({ game: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_current_card_id: null, agenda_vote_current_player_id: VOTER_PLAYER_ID } })
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(res.status).toBe(409)
  })

  it('returns 400 when vote_count exceeds available influence', async () => {
    // max non-exhausted influence = 3 + 2 = 5
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 6 }))
    expect(res.status).toBe(400)
  })

  it('upserts vote and advances current voter on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 2 }))
    expect(res.status).toBe(200)
    expect(upsertVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ game_player_id: VOTER_PLAYER_ID, choice: 'For', vote_count: 2, abstained: false }),
      expect.anything(),
    )
    expect(updateGameMock).toHaveBeenCalledWith(
      expect.objectContaining({ agenda_vote_current_player_id: 'p3' }),
    )
  })

  it('accepts abstain and sets vote_count 0', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, abstain: true }))
    expect(res.status).toBe(200)
    expect(upsertVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ abstained: true, vote_count: 0 }),
      expect.anything(),
    )
  })

  it('sets agenda_vote_current_player_id to null when all players have voted', async () => {
    // existingVotes includes all 3 players after this vote
    mockDb({
      existingVotes: [
        { game_player_id: 'p1' },
        { game_player_id: 'p2' },
        { game_player_id: 'p3' },
      ],
    })
    await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(updateGameMock).toHaveBeenCalledWith(
      expect.objectContaining({ agenda_vote_current_player_id: null }),
    )
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/functions/game-cast-votes.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement game-cast-votes/index.ts**

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { getNextPlayer } from '../_shared/player-order.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; choice?: unknown; vote_count?: unknown; abstain?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, speaker_player_id, agenda_current_card_id, agenda_vote_current_player_id')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (!game.agenda_current_card_id) return errorResponse('No agenda card in play', 409)

  const { data: callerPlayer } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!callerPlayer || callerPlayer.id !== game.agenda_vote_current_player_id) {
    return errorResponse('It is not your turn to vote', 403)
  }

  const abstain = body.abstain === true
  const voteCount = abstain ? 0 : (typeof body.vote_count === 'number' ? body.vote_count : 0)
  const choice = abstain ? null : (typeof body.choice === 'string' ? body.choice : null)

  if (!abstain && voteCount > 0) {
    // Validate vote_count against available influence (non-exhausted planets)
    const { data: planets } = await db
      .from('game_player_planets')
      .select('exhausted, influence')
      .eq('game_id', body.game_id)
      .eq('player_id', callerPlayer.id)
    const availableInfluence = (planets ?? [])
      .filter((p: { exhausted: boolean; influence: number }) => !p.exhausted)
      .reduce((sum: number, p: { influence: number }) => sum + (p.influence ?? 0), 0)
    if (voteCount > availableInfluence) {
      return errorResponse(`Vote count ${voteCount} exceeds available influence ${availableInfluence}`, 400)
    }
  }

  const { error: upsertError } = await db
    .from('game_agenda_votes')
    .upsert(
      {
        game_id: body.game_id,
        game_player_id: callerPlayer.id,
        agenda_id: game.agenda_current_card_id,
        choice,
        vote_count: voteCount,
        abstained: abstain,
      },
      { onConflict: 'game_id,game_player_id,agenda_id' },
    )
  if (upsertError) return errorResponse(`Failed to record vote: ${upsertError.message}`, 500)

  // Check if all players have now voted
  const { data: allPlayers } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
  const { data: votes } = await db
    .from('game_agenda_votes')
    .select('game_player_id')
    .eq('game_id', body.game_id)
    .eq('agenda_id', game.agenda_current_card_id)

  const allVoted = (allPlayers ?? []).length === (votes ?? []).length

  let nextVoterId: string | null = null
  if (!allVoted) {
    nextVoterId = await getNextPlayer(body.game_id, callerPlayer.id, 'reverse_speaker', game.speaker_player_id, db)
  }

  const { error: updateError } = await db
    .from('games')
    .update({ agenda_vote_current_player_id: nextVoterId })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Failed to advance voter: ${updateError.message}`, 500)

  return okResponse({ voted: true, all_voted: allVoted })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/functions/game-cast-votes.test.js
```
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-cast-votes/index.ts ti4-companion-web/tests/functions/game-cast-votes.test.js
git commit -m "feat: add game-cast-votes Edge Function with turn enforcement"
```

---

## Task 7: game-resolve-agenda Edge Function — TDD

**Files:**
- Create: `supabase/functions/game-resolve-agenda/index.ts`
- Create: `ti4-companion-web/tests/functions/game-resolve-agenda.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/functions/game-resolve-agenda.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) { super(msg); this.name = 'AuthError' }
  }
  return { requireAuth: vi.fn(), AuthError }
})
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { handler } from '../../../supabase/functions/game-resolve-agenda/index.ts'

const GAME_ID = 'game-uuid'
const SPEAKER_USER_ID = 'speaker-user'
const SPEAKER_PLAYER_ID = 'p1'
const AGENDA_ID = 'agenda-uuid'
const DECK_ROW_ID = 'deck-row-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-resolve-agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let updateGameMock, updateDeckMock, updatePlayerMock, updatePlanetMock, insertLawsMock

function mockDb({
  game = { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_current_card_id: AGENDA_ID, agenda_phase_step: 'agenda_1_voting', round: 3 },
  callerPlayer = { id: SPEAKER_PLAYER_ID },
  agenda = { id: AGENDA_ID, type: 'directive', elect_type: null, tractable: false, effect_json: {} },
  deckRow = { id: DECK_ROW_ID },
  updateGameError = null,
} = {}) {
  updateGameMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateGameError }) })
  updateDeckMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  updatePlayerMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  updatePlanetMock = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })
  insertLawsMock = vi.fn().mockResolvedValue({ error: null })

  db.from.mockImplementation((table) => {
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }) }) }),
      update: updateGameMock,
    }
    if (table === 'game_players') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: callerPlayer, error: null }) }) }),
      }),
      update: updatePlayerMock,
    }
    if (table === 'agendas') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: agenda, error: null }) }) }),
    }
    if (table === 'game_agenda_deck') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: deckRow, error: null }) }) }) }),
      update: updateDeckMock,
    }
    if (table === 'game_laws') return { insert: insertLawsMock }
    if (table === 'game_player_planets') return { update: updatePlanetMock }
  })
}

beforeEach(() => { vi.clearAllMocks(); mockDb(); requireAuth.mockResolvedValue(SPEAKER_USER_ID) })

describe('game-resolve-agenda', () => {
  it('returns 401 for unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: null }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller is not the speaker', async () => {
    mockDb({ callerPlayer: { id: 'not-speaker' } })
    const res = await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: null }))
    expect(res.status).toBe(403)
  })

  it('returns 409 when agenda_id does not match current card', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, agenda_id: 'wrong-agenda', elected_target: null }))
    expect(res.status).toBe(409)
  })

  it('discards directive — sets deck state to discarded', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: null }))
    expect(res.status).toBe(200)
    expect(updateDeckMock).toHaveBeenCalledWith({ state: 'discarded' })
    expect(insertLawsMock).not.toHaveBeenCalled()
  })

  it('enacts non-tractable law — inserts with host_applies_manually true', async () => {
    mockDb({ agenda: { id: AGENDA_ID, type: 'law', elect_type: 'player', tractable: false, effect_json: {} } })
    await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: 'p2' }))
    expect(updateDeckMock).toHaveBeenCalledWith({ state: 'enacted' })
    expect(insertLawsMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_id: AGENDA_ID,
      elected_target: 'p2',
      host_applies_manually: true,
      is_repealed: false,
    }))
  })

  it('tractable award_vp law — updates player VP and enacts', async () => {
    mockDb({ agenda: { id: AGENDA_ID, type: 'law', elect_type: 'player', tractable: true, effect_json: { op: 'award_vp', amount: 1 } } })
    await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: 'p2' }))
    expect(updatePlayerMock).toHaveBeenCalled()
    expect(updateDeckMock).toHaveBeenCalledWith({ state: 'enacted' })
    expect(insertLawsMock).toHaveBeenCalledWith(expect.objectContaining({
      host_applies_manually: false,
    }))
  })

  it('advances step from agenda_1_voting to agenda_1_resolved', async () => {
    await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: null }))
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_phase_step: 'agenda_1_resolved',
      agenda_current_card_id: null,
      agenda_vote_current_player_id: null,
    }))
  })

  it('advances step from agenda_2_voting to done', async () => {
    mockDb({ game: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_current_card_id: AGENDA_ID, agenda_phase_step: 'agenda_2_voting', round: 3 } })
    await handler(makeRequest({ game_id: GAME_ID, agenda_id: AGENDA_ID, elected_target: null }))
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({
      agenda_phase_step: 'done',
    }))
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/functions/game-resolve-agenda.test.js
```

- [ ] **Step 3: Implement game-resolve-agenda/index.ts**

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

const STEP_AFTER: Record<string, string> = {
  'agenda_1_voting': 'agenda_1_resolved',
  'agenda_2_voting': 'done',
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; agenda_id?: unknown; elected_target?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.agenda_id || typeof body.agenda_id !== 'string') return errorResponse("'agenda_id' is required")

  const { data: game } = await db
    .from('games')
    .select('id, speaker_player_id, agenda_current_card_id, agenda_phase_step, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (!game) return errorResponse('Game not found', 404)

  const { data: callerPlayer } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!callerPlayer || callerPlayer.id !== game.speaker_player_id) {
    return errorResponse('Only the speaker can resolve the agenda', 403)
  }

  if (game.agenda_current_card_id !== body.agenda_id) {
    return errorResponse('agenda_id does not match current card', 409)
  }

  const { data: agenda } = await db
    .from('agendas')
    .select('id, type, elect_type, tractable, effect_json')
    .eq('id', body.agenda_id)
    .maybeSingle()
  if (!agenda) return errorResponse('Agenda not found', 404)

  const { data: deckRow } = await db
    .from('game_agenda_deck')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('agenda_id', body.agenda_id)
    .eq('state', 'voting')
    .maybeSingle()
  if (!deckRow) return errorResponse('Deck row not found', 404)

  const electedTarget = typeof body.elected_target === 'string' ? body.elected_target : null
  const isLaw = agenda.type === 'law'
  const terminalDeckState = isLaw ? 'enacted' : 'discarded'

  // Apply tractable effect
  if (isLaw && agenda.tractable && agenda.effect_json?.op) {
    const effect = agenda.effect_json as { op: string; amount?: number; tech?: string }

    if (effect.op === 'award_vp' && electedTarget) {
      const { data: target } = await db.from('game_players').select('vp').eq('id', electedTarget).maybeSingle()
      if (target) {
        await db.from('game_players').update({ vp: target.vp + (effect.amount ?? 1) }).eq('id', electedTarget)
      }
    }

    if (effect.op === 'remove_vp' && electedTarget) {
      const { data: target } = await db.from('game_players').select('vp').eq('id', electedTarget).maybeSingle()
      if (target) {
        await db.from('game_players').update({ vp: Math.max(0, target.vp - (effect.amount ?? 1)) }).eq('id', electedTarget)
      }
    }

    if (effect.op === 'exhaust_planet' && electedTarget) {
      await db.from('game_player_planets').update({ exhausted: true }).eq('game_id', body.game_id).eq('planet_name', electedTarget)
    }

    if (effect.op === 'grant_tech' && electedTarget && effect.tech) {
      const { data: target } = await db.from('game_players').select('technologies').eq('id', electedTarget).maybeSingle()
      if (target) {
        const techs: string[] = target.technologies ?? []
        if (!techs.includes(effect.tech)) {
          await db.from('game_players').update({ technologies: [...techs, effect.tech] }).eq('id', electedTarget)
        }
      }
    }
  }

  // Update deck state
  await db.from('game_agenda_deck').update({ state: terminalDeckState }).eq('id', deckRow.id)

  // Insert law record if applicable
  if (isLaw) {
    await db.from('game_laws').insert({
      game_id: body.game_id,
      agenda_id: body.agenda_id,
      round_enacted: game.round,
      elected_target: electedTarget,
      is_repealed: false,
      host_applies_manually: !agenda.tractable,
    })
  }

  // Advance game step
  const nextStep = STEP_AFTER[game.agenda_phase_step] ?? 'done'
  await db.from('games').update({
    agenda_phase_step: nextStep,
    agenda_current_card_id: null,
    agenda_vote_current_player_id: null,
  }).eq('id', body.game_id)

  return okResponse({ resolved: true, next_step: nextStep })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/functions/game-resolve-agenda.test.js
```
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-resolve-agenda/index.ts ti4-companion-web/tests/functions/game-resolve-agenda.test.js
git commit -m "feat: add game-resolve-agenda Edge Function"
```

---

## Task 8: PlanetSelectionModal component — TDD

**Files:**
- Create: `src/components/game/PlanetSelectionModal.jsx`
- Create: `tests/components/game/PlanetSelectionModal.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// tests/components/game/PlanetSelectionModal.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PlanetSelectionModal from '../../../src/components/game/PlanetSelectionModal.jsx'

const ALL_PLANETS = [
  { id: 'pl-1', planet_name: 'Nestphar', player_id: 'p1', exhausted: false, influence: 3, resources: 1, trait: 'cultural' },
  { id: 'pl-2', planet_name: 'Lazar',    player_id: 'p1', exhausted: false, influence: 1, resources: 2, trait: 'industrial' },
  { id: 'pl-3', planet_name: 'Sakulag',  player_id: 'p1', exhausted: true,  influence: 2, resources: 1, trait: 'hazardous' },
  { id: 'pl-4', planet_name: 'Mecatol',  player_id: 'p2', exhausted: false, influence: 1, resources: 1, trait: null },
]

const DEFAULT_PROPS = {
  planets: ALL_PLANETS,
  currentPlayerId: 'p1',
  scope: 'own',
  filter: 'non-exhausted',
  selectionMode: 'multi',
  valueMode: 'influence',
  label: 'Select planets to exhaust',
  onConfirm: vi.fn(),
  onClose: vi.fn(),
}

function renderModal(overrides = {}) {
  return render(<PlanetSelectionModal {...DEFAULT_PROPS} {...overrides} />)
}

describe('PlanetSelectionModal', () => {
  it('shows the label', () => {
    renderModal()
    expect(screen.getByText('Select planets to exhaust')).toBeInTheDocument()
  })

  it('scope=own shows only current player planets', () => {
    renderModal()
    expect(screen.getByText('Nestphar')).toBeInTheDocument()
    expect(screen.queryByText('Mecatol')).not.toBeInTheDocument()
  })

  it('filter=non-exhausted hides exhausted planets', () => {
    renderModal()
    expect(screen.queryByText('Sakulag')).not.toBeInTheDocument()
  })

  it('filter=all shows exhausted planets', () => {
    renderModal({ filter: 'all' })
    expect(screen.getByText('Sakulag')).toBeInTheDocument()
  })

  it('scope=any-player shows all players planets', () => {
    renderModal({ scope: 'any-player', filter: 'all' })
    expect(screen.getByText('Mecatol')).toBeInTheDocument()
  })

  it('multi selection toggles planet in/out', () => {
    const onConfirm = vi.fn()
    renderModal({ onConfirm })
    fireEvent.click(screen.getByText('Nestphar'))
    fireEvent.click(screen.getByText('Lazar'))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith(['pl-1', 'pl-2'])
  })

  it('single selection replaces previous selection', () => {
    const onConfirm = vi.fn()
    renderModal({ selectionMode: 'single', filter: 'all', onConfirm })
    fireEvent.click(screen.getByText('Nestphar'))
    fireEvent.click(screen.getByText('Lazar'))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith(['pl-2'])
  })

  it('valueMode=influence shows influence total', () => {
    renderModal()
    fireEvent.click(screen.getByText('Nestphar'))
    // influence: 3 selected
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/game/PlanetSelectionModal.test.jsx
```

- [ ] **Step 3: Implement PlanetSelectionModal.jsx**

```jsx
import { useState, useMemo } from 'react'

export default function PlanetSelectionModal({
  planets = [],
  currentPlayerId,
  scope = 'own',
  filter = 'all',
  selectionMode = 'single',
  valueMode = 'none',
  label = 'Select a planet',
  onConfirm,
  onClose,
}) {
  const [selected, setSelected] = useState([])

  const visible = useMemo(() => {
    let list = planets
    if (scope === 'own') list = list.filter(p => p.player_id === currentPlayerId)
    if (filter === 'non-exhausted') list = list.filter(p => !p.exhausted)
    if (filter === 'exhausted') list = list.filter(p => p.exhausted)
    if (['cultural', 'industrial', 'hazardous'].includes(filter)) list = list.filter(p => p.trait === filter)
    return list
  }, [planets, scope, filter, currentPlayerId])

  const valueTotal = useMemo(() => {
    if (valueMode === 'none') return null
    const key = valueMode === 'influence' ? 'influence' : 'resources'
    return selected.reduce((sum, id) => {
      const p = planets.find(pl => pl.id === id)
      return sum + (p?.[key] ?? 0)
    }, 0)
  }, [selected, planets, valueMode])

  function toggle(id) {
    if (selectionMode === 'single') {
      setSelected(prev => prev[0] === id ? [] : [id])
    } else {
      setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="panel w-full max-w-sm mx-4 flex flex-col gap-4">
        <p className="label">{label}</p>

        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {visible.map(planet => {
            const isSelected = selected.includes(planet.id)
            const val = valueMode === 'influence' ? planet.influence
              : valueMode === 'resources' ? planet.resources : null
            return (
              <button
                key={planet.id}
                onClick={() => toggle(planet.id)}
                className={`flex items-center justify-between text-xs px-3 py-2 rounded border transition-all ${
                  isSelected
                    ? 'border-gold bg-hull ring-1 ring-gold text-text'
                    : 'border-border bg-void text-dim hover:text-text'
                }`}
              >
                <span>{planet.planet_name}</span>
                {val !== null && <span className="text-muted">{val}</span>}
              </button>
            )
          })}
          {visible.length === 0 && (
            <p className="text-dim text-xs text-center py-2">No planets available</p>
          )}
        </div>

        {valueTotal !== null && (
          <p className="text-xs text-muted text-right">
            Total: <span className="text-text font-display">{valueTotal}</span>
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button className="btn-ghost text-xs" onClick={onClose}>CANCEL</button>
          <button className="btn-primary text-xs" onClick={() => onConfirm(selected)}>CONFIRM</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/components/game/PlanetSelectionModal.test.jsx
```
Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/PlanetSelectionModal.jsx tests/components/game/PlanetSelectionModal.test.jsx
git commit -m "feat: add PlanetSelectionModal reusable component"
```

---

## Task 9: VotingPanel component — TDD

**Files:**
- Create: `src/components/game/VotingPanel.jsx`
- Create: `tests/components/game/VotingPanel.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// tests/components/game/VotingPanel.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VotingPanel from '../../../src/components/game/VotingPanel.jsx'

const AGENDA = {
  id: 'ag-1',
  name: 'Political Censure',
  outcome: 'For/Against',
  elect_type: null,
}

const VOTES = [
  { game_player_id: 'p1', choice: 'For', vote_count: 3, abstained: false },
]

const PLANETS = [
  { id: 'pl-1', planet_name: 'Nestphar', player_id: 'p2', exhausted: false, influence: 3, resources: 1 },
]

const DEFAULT_PROPS = {
  agenda: AGENDA,
  votes: VOTES,
  players: [
    { id: 'p1', display_name: 'Alice' },
    { id: 'p2', display_name: 'Bob' },
  ],
  currentPlayer: { id: 'p2', display_name: 'Bob' },
  currentVoterId: 'p2',
  planets: PLANETS,
  onCastVote: vi.fn(),
}

function renderPanel(overrides = {}) {
  return render(<VotingPanel {...DEFAULT_PROPS} {...overrides} />)
}

describe('VotingPanel', () => {
  it('shows the agenda name', () => {
    renderPanel()
    expect(screen.getByText('Political Censure')).toBeInTheDocument()
  })

  it('shows vote totals per choice', () => {
    renderPanel()
    expect(screen.getByText(/for/i)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows per-player vote status', () => {
    renderPanel()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows vote controls when it is the current player\'s turn', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /abstain/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /vote/i })).toBeInTheDocument()
  })

  it('hides vote controls when it is not the current player\'s turn', () => {
    renderPanel({ currentVoterId: 'p1' })
    expect(screen.queryByRole('button', { name: /abstain/i })).not.toBeInTheDocument()
  })

  it('calls onCastVote with abstain=true when abstain clicked', () => {
    const onCastVote = vi.fn()
    renderPanel({ onCastVote })
    fireEvent.click(screen.getByRole('button', { name: /abstain/i }))
    expect(onCastVote).toHaveBeenCalledWith({ abstain: true })
  })

  it('highlights whose turn it is', () => {
    renderPanel()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/game/VotingPanel.test.jsx
```

- [ ] **Step 3: Implement VotingPanel.jsx**

```jsx
import { useState } from 'react'
import PlanetSelectionModal from './PlanetSelectionModal.jsx'

export default function VotingPanel({
  agenda,
  votes = [],
  players = [],
  currentPlayer,
  currentVoterId,
  planets = [],
  onCastVote,
}) {
  const [showPlanetPicker, setShowPlanetPicker] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState(null)

  const isMyTurn = currentPlayer?.id === currentVoterId
  const myVote = votes.find(v => v.game_player_id === currentPlayer?.id)

  // Tally votes per choice
  const tally = votes.reduce((acc, v) => {
    if (!v.abstained && v.choice) {
      acc[v.choice] = (acc[v.choice] ?? 0) + v.vote_count
    }
    return acc
  }, {})

  const options = agenda?.outcome === 'For/Against' ? ['For', 'Against'] : []

  function handleVote(selectedPlanetIds) {
    const myPlanets = planets.filter(p => selectedPlanetIds.includes(p.id))
    const voteCount = myPlanets.reduce((sum, p) => sum + (p.influence ?? 0), 0)
    onCastVote({ choice: selectedChoice, vote_count: voteCount, abstain: false })
    setShowPlanetPicker(false)
  }

  function handleVoteClick(choice) {
    setSelectedChoice(choice)
    setShowPlanetPicker(true)
  }

  return (
    <div className="panel-inset flex flex-col gap-3">
      <p className="label text-xs">AGENDA VOTE</p>
      <p className="text-text font-display text-sm">{agenda?.name}</p>

      {/* Live vote totals */}
      <div className="flex gap-4">
        {options.map(opt => (
          <div key={opt} className="flex flex-col items-center">
            <span className="text-dim text-xs uppercase">{opt}</span>
            <span className="text-text font-display">{tally[opt] ?? 0}</span>
          </div>
        ))}
      </div>

      {/* Per-player status */}
      <div className="flex flex-col gap-1">
        {players.map(p => {
          const voted = votes.find(v => v.game_player_id === p.id)
          const isCurrentVoter = p.id === currentVoterId
          return (
            <div key={p.id} className={`flex items-center justify-between text-xs ${isCurrentVoter ? 'text-gold' : 'text-dim'}`}>
              <span>{p.display_name}{isCurrentVoter ? ' ◀' : ''}</span>
              <span>{voted ? (voted.abstained ? 'Abstained' : `${voted.vote_count} — ${voted.choice}`) : '...'}</span>
            </div>
          )
        })}
      </div>

      {/* Active voter controls */}
      {isMyTurn && !myVote && (
        <div className="flex gap-2 flex-wrap">
          {options.map(opt => (
            <button
              key={opt}
              className="btn-ghost text-xs"
              onClick={() => handleVoteClick(opt)}
            >
              VOTE {opt.toUpperCase()}
            </button>
          ))}
          <button className="btn-ghost text-xs" onClick={() => onCastVote({ abstain: true })}>
            ABSTAIN
          </button>
        </div>
      )}

      {showPlanetPicker && (
        <PlanetSelectionModal
          planets={planets}
          currentPlayerId={currentPlayer?.id}
          scope="own"
          filter="non-exhausted"
          selectionMode="multi"
          valueMode="influence"
          label="Select planets to exhaust for votes"
          onConfirm={handleVote}
          onClose={() => setShowPlanetPicker(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/components/game/VotingPanel.test.jsx
```
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/VotingPanel.jsx tests/components/game/VotingPanel.test.jsx
git commit -m "feat: add VotingPanel component"
```

---

## Task 10: AgendaSection component — TDD

**Files:**
- Create: `src/components/game/AgendaSection.jsx`
- Create: `tests/components/game/AgendaSection.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// tests/components/game/AgendaSection.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AgendaSection from '../../../src/components/game/AgendaSection.jsx'

const GAME_AGENDA_VOTING = {
  id: 'game-1',
  agenda_phase_step: 'agenda_1_voting',
  agenda_current_card_id: 'ag-1',
  agenda_vote_current_player_id: 'p2',
  speaker_player_id: 'p1',
}

const AGENDA = {
  id: 'ag-1',
  name: 'Political Censure',
  type: 'directive',
  outcome: 'For/Against',
  elect_type: null,
  tractable: false,
  effect_json: {},
}

const PLAYERS = [
  { id: 'p1', display_name: 'Alice' },
  { id: 'p2', display_name: 'Bob' },
]

const DEFAULT_PROPS = {
  game: GAME_AGENDA_VOTING,
  agenda: AGENDA,
  votes: [],
  players: PLAYERS,
  currentPlayer: { id: 'p2', display_name: 'Bob' },
  isSpeaker: false,
  planets: [],
  onDrawAgenda: vi.fn(),
  onCastVote: vi.fn(),
  onResolve: vi.fn(),
}

function renderSection(overrides = {}) {
  return render(<AgendaSection {...DEFAULT_PROPS} {...overrides} />)
}

describe('AgendaSection', () => {
  it('renders nothing when phase step is inactive', () => {
    const { container } = renderSection({ game: { ...GAME_AGENDA_VOTING, agenda_phase_step: 'inactive' } })
    expect(container.firstChild).toBeNull()
  })

  it('shows agenda card name when in play', () => {
    renderSection()
    expect(screen.getByText('Political Censure')).toBeInTheDocument()
  })

  it('shows "Draw Agenda" button when speaker and no card in play', () => {
    renderSection({
      isSpeaker: true,
      game: { ...GAME_AGENDA_VOTING, agenda_current_card_id: null },
      agenda: null,
    })
    expect(screen.getByRole('button', { name: /draw agenda/i })).toBeInTheDocument()
  })

  it('hides "Draw Agenda" for non-speaker', () => {
    renderSection({
      isSpeaker: false,
      game: { ...GAME_AGENDA_VOTING, agenda_current_card_id: null },
      agenda: null,
    })
    expect(screen.queryByRole('button', { name: /draw agenda/i })).not.toBeInTheDocument()
  })

  it('calls onDrawAgenda when speaker clicks Draw Agenda', () => {
    const onDrawAgenda = vi.fn()
    renderSection({
      isSpeaker: true,
      game: { ...GAME_AGENDA_VOTING, agenda_current_card_id: null },
      agenda: null,
      onDrawAgenda,
    })
    fireEvent.click(screen.getByRole('button', { name: /draw agenda/i }))
    expect(onDrawAgenda).toHaveBeenCalled()
  })

  it('shows Resolve button for speaker when all voted (current voter null)', () => {
    renderSection({
      isSpeaker: true,
      game: { ...GAME_AGENDA_VOTING, agenda_vote_current_player_id: null },
    })
    expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument()
  })

  it('hides Resolve button when voting is still in progress', () => {
    renderSection({ isSpeaker: true })
    expect(screen.queryByRole('button', { name: /resolve/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/game/AgendaSection.test.jsx
```

- [ ] **Step 3: Implement AgendaSection.jsx**

```jsx
import { useState } from 'react'
import VotingPanel from './VotingPanel.jsx'
import AgendaResolutionModal from './AgendaResolutionModal.jsx'

export default function AgendaSection({
  game,
  agenda,
  votes = [],
  players = [],
  currentPlayer,
  isSpeaker,
  planets = [],
  onDrawAgenda,
  onCastVote,
  onResolve,
}) {
  const [resolvingOpen, setResolvingOpen] = useState(false)

  const step = game?.agenda_phase_step
  if (!step || step === 'inactive') return null

  const cardInPlay = !!game.agenda_current_card_id
  const allVoted = cardInPlay && !game.agenda_vote_current_player_id

  return (
    <div className="panel flex flex-col gap-4">
      <p className="label">AGENDA PHASE</p>

      {/* Draw button — speaker only, no card in play */}
      {isSpeaker && !cardInPlay && (
        <button className="btn-primary" onClick={onDrawAgenda}>
          DRAW AGENDA
        </button>
      )}

      {!cardInPlay && !isSpeaker && (
        <p className="text-dim text-xs">Waiting for speaker to draw the next agenda…</p>
      )}

      {/* Voting panel — card is in play */}
      {cardInPlay && agenda && (
        <VotingPanel
          agenda={agenda}
          votes={votes}
          players={players}
          currentPlayer={currentPlayer}
          currentVoterId={game.agenda_vote_current_player_id}
          planets={planets}
          onCastVote={onCastVote}
        />
      )}

      {/* Resolve — speaker only, all votes in */}
      {isSpeaker && allVoted && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => setResolvingOpen(true)}>
            RESOLVE
          </button>
        </div>
      )}

      {resolvingOpen && agenda && (
        <AgendaResolutionModal
          agenda={agenda}
          votes={votes}
          players={players}
          planets={planets}
          currentPlayerId={currentPlayer?.id}
          onConfirm={(electedTarget) => {
            onResolve(game.agenda_current_card_id, electedTarget)
            setResolvingOpen(false)
          }}
          onClose={() => setResolvingOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/components/game/AgendaSection.test.jsx
```
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/AgendaSection.jsx tests/components/game/AgendaSection.test.jsx
git commit -m "feat: add AgendaSection component"
```

---

## Task 11: AgendaResolutionModal component — TDD

**Files:**
- Create: `src/components/game/AgendaResolutionModal.jsx`
- Create: `tests/components/game/AgendaResolutionModal.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// tests/components/game/AgendaResolutionModal.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AgendaResolutionModal from '../../../src/components/game/AgendaResolutionModal.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice' },
  { id: 'p2', display_name: 'Bob' },
]
const PLANETS = [
  { id: 'pl-1', planet_name: 'Mecatol Rex', player_id: 'p1', exhausted: false, influence: 1, resources: 1 },
]
const VOTES = [
  { game_player_id: 'p1', choice: 'For', vote_count: 3, abstained: false },
  { game_player_id: 'p2', choice: 'Against', vote_count: 1, abstained: false },
]

const DEFAULT_PROPS = {
  agenda: { id: 'ag-1', name: 'Political Censure', type: 'directive', elect_type: null, tractable: false, effect_json: {}, outcome: 'For/Against' },
  votes: VOTES,
  players: PLAYERS,
  planets: PLANETS,
  currentPlayerId: 'p1',
  onConfirm: vi.fn(),
  onClose: vi.fn(),
}

function renderModal(overrides = {}) {
  return render(<AgendaResolutionModal {...DEFAULT_PROPS} {...overrides} />)
}

describe('AgendaResolutionModal', () => {
  it('shows the agenda name', () => {
    renderModal()
    expect(screen.getByText('Political Censure')).toBeInTheDocument()
  })

  it('shows vote totals', () => {
    renderModal()
    expect(screen.getByText(/for.*3/i)).toBeInTheDocument()
  })

  it('For/Against: calls onConfirm with "For" when For wins', () => {
    const onConfirm = vi.fn()
    renderModal({ onConfirm })
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith('For')
  })

  it('elect_type=player: shows player picker', () => {
    renderModal({ agenda: { ...DEFAULT_PROPS.agenda, elect_type: 'player', outcome: 'Elect Player' } })
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('elect_type=player: calls onConfirm with selected player id', () => {
    const onConfirm = vi.fn()
    renderModal({
      agenda: { ...DEFAULT_PROPS.agenda, elect_type: 'player', outcome: 'Elect Player' },
      onConfirm,
    })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p2' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith('p2')
  })

  it('non-tractable: shows manual reminder banner', () => {
    renderModal({ agenda: { ...DEFAULT_PROPS.agenda, type: 'law', tractable: false } })
    expect(screen.getByText(/host applies manually/i)).toBeInTheDocument()
  })

  it('calls onClose on cancel', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/game/AgendaResolutionModal.test.jsx
```

- [ ] **Step 3: Implement AgendaResolutionModal.jsx**

```jsx
import { useState, useMemo } from 'react'
import PlanetSelectionModal from './PlanetSelectionModal.jsx'

function tallyVotes(votes) {
  return votes.reduce((acc, v) => {
    if (!v.abstained && v.choice) {
      acc[v.choice] = (acc[v.choice] ?? 0) + v.vote_count
    }
    return acc
  }, {})
}

function winnerForAgainst(tally) {
  const forVotes = tally['For'] ?? 0
  const againstVotes = tally['Against'] ?? 0
  return forVotes > againstVotes ? 'For' : 'Against'
}

export default function AgendaResolutionModal({
  agenda,
  votes = [],
  players = [],
  planets = [],
  currentPlayerId,
  onConfirm,
  onClose,
}) {
  const tally = useMemo(() => tallyVotes(votes), [votes])
  const [electedPlayer, setElectedPlayer] = useState('')
  const [electedText, setElectedText] = useState('')
  const [showPlanetPicker, setShowPlanetPicker] = useState(false)
  const [electedPlanet, setElectedPlanet] = useState(null)

  const isForAgainst = agenda?.outcome === 'For/Against' || !agenda?.elect_type
  const electType = agenda?.elect_type
  const isNonTractable = agenda?.type === 'law' && !agenda?.tractable

  function handleConfirm() {
    if (isForAgainst) {
      onConfirm(winnerForAgainst(tally))
    } else if (electType === 'player') {
      onConfirm(electedPlayer)
    } else if (electType === 'planet') {
      onConfirm(electedPlanet)
    } else {
      onConfirm(electedText || null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="panel w-full max-w-sm mx-4 flex flex-col gap-4">
        <p className="label">RESOLVE: {agenda?.name}</p>

        {/* Vote summary */}
        <div className="panel-inset">
          <p className="text-dim text-xs mb-1">VOTE TOTALS</p>
          {Object.entries(tally).map(([choice, count]) => (
            <p key={choice} className="text-xs text-text">{choice}: {count}</p>
          ))}
          {Object.keys(tally).length === 0 && (
            <p className="text-xs text-dim">No votes cast</p>
          )}
        </div>

        {/* Non-tractable reminder */}
        {isNonTractable && (
          <div className="panel-inset">
            <p className="label text-xs text-warning">HOST APPLIES MANUALLY</p>
            <p className="text-xs text-muted mt-1">{agenda?.note ?? 'Apply this law\'s effect manually before confirming.'}</p>
          </div>
        )}

        {/* For/Against: auto-determine winner, no picker needed */}
        {isForAgainst && (
          <p className="text-xs text-text">
            Winner: <span className="text-gold font-display">{winnerForAgainst(tally)}</span>
          </p>
        )}

        {/* Elect player picker */}
        {electType === 'player' && (
          <select
            className="input text-xs"
            value={electedPlayer}
            onChange={e => setElectedPlayer(e.target.value)}
          >
            <option value="">Select player…</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        )}

        {/* Elect planet picker */}
        {electType === 'planet' && (
          <div>
            <p className="text-xs text-dim mb-1">{electedPlanet ?? 'No planet selected'}</p>
            <button className="btn-ghost text-xs" onClick={() => setShowPlanetPicker(true)}>
              SELECT PLANET
            </button>
          </div>
        )}

        {/* Free text (laws, etc.) */}
        {electType && !['player', 'planet'].includes(electType) && (
          <input
            className="input text-xs"
            placeholder="Enter elected target…"
            value={electedText}
            onChange={e => setElectedText(e.target.value)}
          />
        )}

        <div className="flex gap-2 justify-end">
          <button className="btn-ghost text-xs" onClick={onClose}>CANCEL</button>
          <button className="btn-primary text-xs" onClick={handleConfirm}>CONFIRM</button>
        </div>
      </div>

      {showPlanetPicker && (
        <PlanetSelectionModal
          planets={planets}
          currentPlayerId={currentPlayerId}
          scope="any-player"
          filter="all"
          selectionMode="single"
          valueMode="none"
          label="Elect a planet"
          onConfirm={(ids) => {
            const p = planets.find(pl => pl.id === ids[0])
            setElectedPlanet(p?.planet_name ?? null)
            setShowPlanetPicker(false)
          }}
          onClose={() => setShowPlanetPicker(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/components/game/AgendaResolutionModal.test.jsx
```
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/AgendaResolutionModal.jsx tests/components/game/AgendaResolutionModal.test.jsx
git commit -m "feat: add AgendaResolutionModal component"
```

---

## Task 12: EnactedLawsPanel component — TDD

**Files:**
- Create: `src/components/game/EnactedLawsPanel.jsx`
- Create: `tests/components/game/EnactedLawsPanel.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// tests/components/game/EnactedLawsPanel.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EnactedLawsPanel from '../../../src/components/game/EnactedLawsPanel.jsx'

const LAWS = [
  { id: 'l1', agenda_id: 'ag-1', elected_target: 'p1', is_repealed: false, host_applies_manually: false,
    agendas: { name: 'Shard of the Throne' } },
  { id: 'l2', agenda_id: 'ag-2', elected_target: null, is_repealed: true, host_applies_manually: false,
    agendas: { name: 'Political Censure' } },
  { id: 'l3', agenda_id: 'ag-3', elected_target: 'Mecatol Rex', is_repealed: false, host_applies_manually: true,
    agendas: { name: 'Publicize Weapon Schematics' } },
]

describe('EnactedLawsPanel', () => {
  it('renders nothing when laws is empty', () => {
    const { container } = render(<EnactedLawsPanel laws={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('starts collapsed', () => {
    render(<EnactedLawsPanel laws={LAWS} />)
    expect(screen.queryByText('Shard of the Throne')).not.toBeInTheDocument()
  })

  it('expands on click', () => {
    render(<EnactedLawsPanel laws={LAWS} />)
    fireEvent.click(screen.getByText(/enacted laws/i))
    expect(screen.getByText('Shard of the Throne')).toBeInTheDocument()
  })

  it('shows active law count in header', () => {
    render(<EnactedLawsPanel laws={LAWS} />)
    // 2 non-repealed laws
    expect(screen.getByText(/2/)).toBeInTheDocument()
  })

  it('shows repealed law struck-through', () => {
    render(<EnactedLawsPanel laws={LAWS} />)
    fireEvent.click(screen.getByText(/enacted laws/i))
    const repealedEl = screen.getByText('Political Censure')
    expect(repealedEl.className).toMatch(/line-through/)
  })

  it('shows manual reminder for host_applies_manually laws', () => {
    render(<EnactedLawsPanel laws={LAWS} />)
    fireEvent.click(screen.getByText(/enacted laws/i))
    expect(screen.getByText(/manual/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/game/EnactedLawsPanel.test.jsx
```

- [ ] **Step 3: Implement EnactedLawsPanel.jsx**

```jsx
import { useState } from 'react'

export default function EnactedLawsPanel({ laws = [] }) {
  const [open, setOpen] = useState(false)
  if (laws.length === 0) return null

  const activeCount = laws.filter(l => !l.is_repealed).length

  return (
    <div className="panel flex flex-col gap-2">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setOpen(o => !o)}
      >
        <p className="label">ENACTED LAWS</p>
        <span className="text-muted text-xs">{activeCount} active {open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2">
          {laws.map(law => (
            <div key={law.id} className="panel-inset flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <p className={`text-xs font-display ${law.is_repealed ? 'line-through text-dim' : 'text-text'}`}>
                  {law.agendas?.name}
                </p>
                {law.host_applies_manually && !law.is_repealed && (
                  <span className="text-warning text-xs">MANUAL</span>
                )}
              </div>
              {law.elected_target && (
                <p className="text-xs text-muted">{law.elected_target}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/components/game/EnactedLawsPanel.test.jsx
```
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/EnactedLawsPanel.jsx tests/components/game/EnactedLawsPanel.test.jsx
git commit -m "feat: add EnactedLawsPanel component"
```

---

## Task 13: Wire edgeFunctions.js + gameUtils.js + useGame.js

**Files:**
- Modify: `src/lib/edgeFunctions.js`
- Modify: `src/lib/gameUtils.js`
- Modify: `src/hooks/useGame.js`

- [ ] **Step 1: Add three wrappers to edgeFunctions.js**

Add immediately before the final `export { callFunction }` line in `src/lib/edgeFunctions.js`:

```js
export const drawAgenda = (gameId) =>
  callFunction('game-draw-agenda', { game_id: gameId })

export const castVotes = (gameId, payload) =>
  callFunction('game-cast-votes', { game_id: gameId, ...payload })

export const resolveAgenda = (gameId, agendaId, electedTarget) =>
  callFunction('game-resolve-agenda', { game_id: gameId, agenda_id: agendaId, elected_target: electedTarget })
```

- [ ] **Step 2: Add isSpeaker helper to gameUtils.js**

Add to `src/lib/gameUtils.js`:

```js
/**
 * Returns true if the given userId belongs to the current speaker.
 */
export function isSpeaker(players, game, userId) {
  if (!game?.speaker_player_id) return false
  const speaker = players.find(p => p.id === game.speaker_player_id)
  return speaker?.user_id === userId
}
```

- [ ] **Step 3: Update useGame.js — add agenda state, votes subscription, laws fetch, wrappers**

At the top of `useGame.js`, add `drawAgenda, castVotes, resolveAgenda` to the existing destructured import from `'../lib/edgeFunctions.js'`. The current import already brings in `updateGameSettings, pickFactionColor, setSpeaker, startGame, endTurn, passAction, advancePhase, scoreObjective, revealObjective, shuffleDeck, updateCommandTokens, drawActionCard, discardActionCard, researchTechnology, discardSecretObjective, scoreSecretObjective, statusPhase` — append the three new names to that same import statement.

Add new state inside `useGame`, after the existing `useState` declarations:
```js
const [agendaVotes, setAgendaVotes] = useState([])
const [enactedLaws, setEnactedLaws] = useState([])
const [currentAgenda, setCurrentAgenda] = useState(null)
```

At the **top** of `load()`, declare these two local variables alongside the existing `objectivesData`, `planetsData` etc.:
```js
let enactedLawsData = []
let currentAgendaData = null
```

Inside the `load()` async function, inside the `if (isGameScreen)` block (after `mySecretsData` is fetched), add:
```js
if (isGameScreen) {
  // fetch enacted laws
  const { data: laws } = await supabase
    .from('game_laws')
    .select('*, agendas(name, note)')
    .eq('game_id', gameData.id)
  if (!mounted) return
  enactedLawsData = laws ?? []

  // fetch current agenda card if one is in play
  if (gameData.agenda_current_card_id) {
    const { data: ag } = await supabase
      .from('agendas')
      .select('*')
      .eq('id', gameData.agenda_current_card_id)
      .maybeSingle()
    if (!mounted) return
    currentAgendaData = ag ?? null
  }
}
```

Add the `game_agenda_votes` Realtime subscription inside the `if (isGameScreen)` channel block:
```js
.on(
  'postgres_changes',
  { event: '*', schema: 'public', table: 'game_agenda_votes', filter: `game_id=eq.${gameData.id}` },
  (payload) => {
    if (!mounted) return
    setAgendaVotes(prev => {
      if (payload.eventType === 'INSERT') return [...prev, payload.new]
      if (payload.eventType === 'UPDATE') return prev.map(v => v.id === payload.new.id ? payload.new : v)
      if (payload.eventType === 'DELETE') return prev.filter(v => v.id !== payload.old.id)
      return prev
    })
  }
)
```

In the `games` subscription handler, when `agenda_current_card_id` changes, re-fetch the current agenda:
```js
.on(
  'postgres_changes',
  { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` },
  async (payload) => {
    if (!mounted) return
    setGame(prev => ({ ...prev, ...payload.new }))
    // Re-fetch current agenda when card changes
    if (payload.new.agenda_current_card_id !== payload.old?.agenda_current_card_id) {
      if (payload.new.agenda_current_card_id) {
        const { data: ag } = await supabase
          .from('agendas')
          .select('*')
          .eq('id', payload.new.agenda_current_card_id)
          .maybeSingle()
        if (mounted) setCurrentAgenda(ag ?? null)
      } else {
        setCurrentAgenda(null)
        // Re-fetch laws after resolution
        const { data: laws } = await supabase
          .from('game_laws')
          .select('*, agendas(name, note)')
          .eq('game_id', gameData.id)
        if (mounted && laws) setEnactedLaws(laws)
      }
    }
    if (payload.new.status === 'active' && !isGameScreen) {
      navigate(`/game/${code}`, { replace: true })
    }
  }
)
```

Set state after load:
```js
setAgendaVotes([])  // will be loaded on first vote
setEnactedLaws(enactedLawsData)
setCurrentAgenda(currentAgendaData)
```

Add return values and wrappers to the return object:
```js
return {
  // existing...
  agendaVotes,
  enactedLaws,
  currentAgenda,
  // Phase 7 wrappers
  drawTheAgenda: () => game ? drawAgenda(game.id) : Promise.reject(new Error('Game not loaded')),
  castTheVotes: (payload) => game ? castVotes(game.id, payload) : Promise.reject(new Error('Game not loaded')),
  resolveTheAgenda: (agendaId, electedTarget) => game ? resolveAgenda(game.id, agendaId, electedTarget) : Promise.reject(new Error('Game not loaded')),
}
```

- [ ] **Step 4: Run full test suite to catch regressions**

```bash
npm test
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/edgeFunctions.js src/lib/gameUtils.js src/hooks/useGame.js
git commit -m "feat: wire agenda edgeFunctions, gameUtils helper, useGame state + subscriptions"
```

---

## Task 14: Wire GameScreen + HostControlsSection

**Files:**
- Modify: `src/components/game/GameScreen.jsx`
- Modify: `src/components/game/HostControlsSection.jsx`

- [ ] **Step 1: Add Begin/End Agenda Phase buttons to HostControlsSection**

In `HostControlsSection.jsx`, add `agenda_phase_step` to the destructured `game` prop usage, and `onBeginAgendaPhase` / `onEndAgendaPhase` props:

```jsx
export default function HostControlsSection({
  isHost, game, players, objectives,
  onScoreObjective, onRevealObjective, onShuffleDeck, onAdvancePhase,
  onEndStatusPhase, onBeginAgendaPhase, onEndAgendaPhase,
  pendingSecretPlayers = [],
  pendingTokenPlayers = [],
}) {
```

Add the agenda phase controls after the existing phase advance block:

```jsx
      {/* Agenda phase controls */}
      {game?.agenda_phase_step === 'inactive' && (
        <button className="btn-ghost text-xs" onClick={onBeginAgendaPhase}>
          BEGIN AGENDA PHASE
        </button>
      )}
      {game?.agenda_phase_step === 'done' && (
        <button className="btn-ghost text-xs" onClick={onEndAgendaPhase}>
          END AGENDA PHASE
        </button>
      )}
```

- [ ] **Step 2: Update GameScreen.jsx to mount AgendaSection and EnactedLawsPanel**

Add imports at the top of `GameScreen.jsx`:

```jsx
import AgendaSection from './AgendaSection.jsx'
import EnactedLawsPanel from './EnactedLawsPanel.jsx'
import { isSpeaker } from '../../lib/gameUtils.js'
```

Destructure new values from `useGame`:

```jsx
const {
  // existing...
  agendaVotes, enactedLaws, currentAgenda,
  drawTheAgenda, castTheVotes, resolveTheAgenda,
} = useGame(code, userId)
```

Add `isSpeakerFlag` derived value:

```jsx
const isSpeakerFlag = isSpeaker(players, game, userId)
```

Add agenda phase controls to the `games` Realtime shape — pass two new handlers for begin/end agenda phase as direct Supabase client-side updates (these are host-only step transitions, no Edge Function needed):

```jsx
async function beginAgendaPhase() {
  if (!game) return
  await supabase.from('games').update({ agenda_phase_step: 'agenda_1_voting' }).eq('id', game.id)
}

async function endAgendaPhase() {
  if (!game) return
  await supabase.from('games').update({ agenda_phase_step: 'inactive' }).eq('id', game.id)
}
```

In the JSX, add `AgendaSection` after `ObjectivesSection` and `EnactedLawsPanel` before `HostControlsSection`:

```jsx
        <AgendaSection
          game={game}
          agenda={currentAgenda}
          votes={agendaVotes}
          players={players}
          currentPlayer={currentPlayer}
          isSpeaker={isSpeakerFlag}
          planets={planets.filter(p => p.player_id === currentPlayer?.id)}
          onDrawAgenda={drawTheAgenda}
          onCastVote={castTheVotes}
          onResolve={resolveTheAgenda}
        />
        <EnactedLawsPanel laws={enactedLaws} />
```

Pass new props to `HostControlsSection`:

```jsx
        <HostControlsSection
          // existing props...
          onBeginAgendaPhase={beginAgendaPhase}
          onEndAgendaPhase={endAgendaPhase}
        />
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```
Expected: all tests PASS (new components have their own tests; existing tests unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/components/game/GameScreen.jsx src/components/game/HostControlsSection.jsx
git commit -m "feat: wire AgendaSection and EnactedLawsPanel into GameScreen"
```

---

## Task 15: Deploy

- [ ] **Step 1: Apply migration**

```bash
supabase db push
```
Expected: migration `025_phase7.sql` applied with no errors.

- [ ] **Step 2: Deploy Edge Functions**

```bash
supabase functions deploy game-draw-agenda --no-verify-jwt
supabase functions deploy game-cast-votes --no-verify-jwt
supabase functions deploy game-resolve-agenda --no-verify-jwt
supabase functions deploy game-start --no-verify-jwt
supabase functions deploy admin-import-agendas --no-verify-jwt
```

- [ ] **Step 3: Run full test suite one final time**

```bash
cd ti4-companion-web && npm test
```
Expected: all tests PASS.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: phase 7 agenda phase complete"
```
