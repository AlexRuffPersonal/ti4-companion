# Phase 29b — Action Window Mechanism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `pending_action_window` column to `games` that enables reactive action card timing (When/After cards), implement the four window triggers in existing Edge Functions, and show an eligible-player prompt in the UI.

**Architecture:** A JSONB column on `games` records which players are eligible to play or pass a reactive window. Four existing Edge Functions (`game-draw-agenda`, `game-cast-votes`, `game-research-technology`, and a new `game-pass-action-window`) open windows after their main effects. `game-play-action-card` (Phase 29a) gains a reactive branch that resolves the card and advances the window state. A new `ActionWindowBanner` React component watches `game.pending_action_window` via the existing Realtime subscription and renders a prompt for eligible players.

**Prerequisites:** Phase 29a must be complete — `game-play-action-card/index.ts` must exist and handle `Action:` timing cards.

**Tech Stack:** Supabase Edge Functions (TypeScript/Deno), PostgreSQL, React 19, Vitest, @testing-library/react

---

## Files

| File | Action |
|------|--------|
| `supabase/migrations/042_action_window.sql` | Create |
| `supabase/functions/_shared/abilityDsl.ts` | Modify |
| `supabase/functions/game-pass-action-window/index.ts` | Create |
| `supabase/functions/game-play-action-card/index.ts` | Modify |
| `supabase/functions/game-draw-agenda/index.ts` | Modify |
| `supabase/functions/game-cast-votes/index.ts` | Modify |
| `supabase/functions/game-research-technology/index.ts` | Modify |
| `src/lib/edgeFunctions.js` | Modify |
| `src/components/game/ActionWindowBanner.jsx` | Create |
| `src/components/game/GameScreen.jsx` | Modify |
| `ti4-companion-web/tests/lib/abilityDsl.test.js` | Modify |
| `ti4-companion-web/tests/functions/game-pass-action-window.test.js` | Create |
| `ti4-companion-web/tests/functions/game-play-action-card.test.js` | Modify |
| `ti4-companion-web/tests/functions/game-draw-agenda.test.js` | Modify |
| `ti4-companion-web/tests/functions/game-cast-votes.test.js` | Modify |
| `ti4-companion-web/tests/functions/game-research-technology.test.js` | Create |
| `ti4-companion-web/tests/lib/edgeFunctions.phase29b.test.js` | Create |
| `ti4-companion-web/tests/components/ActionWindowBanner.test.jsx` | Create |

---

## Task 1: Migration — add `pending_action_window` to `games`

**Files:**
- Create: `supabase/migrations/042_action_window.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/042_action_window.sql
ALTER TABLE public.games
  ADD COLUMN pending_action_window JSONB;
```

Column is null when no window is open. Shape when set:
```json
{
  "type": "when_agenda_revealed",
  "eligible_player_ids": ["uuid"],
  "passed_player_ids": [],
  "context": {}
}
```

Valid `type` values: `when_agenda_revealed`, `after_speaker_votes`, `when_voting_begins`, `after_technology_researched`.

- [ ] **Step 2: Apply the migration**

```bash
supabase db push
```

Expected: no error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/042_action_window.sql
git commit -m "feat(db): add pending_action_window JSONB column to games (migration 042)"
```

---

## Task 2: DSL — add `windowContext` to `ResolveContext` and implement 3 new ops

The 3 new ops need access to window context (for `research_same_technology`, which reads `technology_name` from the window that triggered it). Extend `ResolveContext` and add `replace_agenda`, `add_votes`, `research_same_technology`.

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`
- Modify: `ti4-companion-web/tests/lib/abilityDsl.test.js`

- [ ] **Step 1: Write the 3 failing tests**

Open `ti4-companion-web/tests/lib/abilityDsl.test.js`. The existing `makeDb` helper currently mocks `game_players` and `game_action_card_deck`. You need a version that also mocks `games` and `game_agenda_deck` and `game_agenda_votes`. Add a second helper `makeDbExtended` (leave `makeDb` unchanged so existing tests keep working):

```js
function makeDbExtended({
  player = { id: 'p1', trade_goods: 5, commodities: 0, vp: 0, technologies: [], action_card_count: 0 },
  game = { id: 'g1', agenda_current_card_id: 'ag1' },
  currentAgendaDeckRow = { id: 'deck1' },
  nextAgendaDeckRow = { id: 'deck2', agenda_id: 'ag2' },
  agendaVotesUpsertError = null,
} = {}) {
  const updateChain = { eq: vi.fn().mockResolvedValue({ error: null }) }
  const updateMock = vi.fn().mockReturnValue(updateChain)
  const upsertMock = vi.fn().mockResolvedValue({ error: agendaVotesUpsertError })

  const db = {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'game_agenda_deck') {
        // first call returns currentAgendaDeckRow (for discard), second returns nextAgendaDeckRow (for draw)
        let callCount = 0
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockImplementation(() => {
                      callCount++
                      return Promise.resolve({
                        data: callCount === 1 ? currentAgendaDeckRow : nextAgendaDeckRow,
                        error: null,
                      })
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'game_agenda_votes') {
        return { upsert: upsertMock }
      }
      return { update: updateMock }
    }),
  }
  return { db, updateMock, upsertMock }
}
```

Then add at the end of `abilityDsl.test.js`:

```js
describe('Phase 29b ops', () => {
  const CTX29B = { gameId: 'g1', activatingPlayerId: 'p1' }

  describe('replace_agenda', () => {
    it('discards current agenda and reveals next deck card', async () => {
      const { db, updateMock } = makeDbExtended()
      await interpretEffects([{ op: 'replace_agenda' }], CTX29B, db)
      // discard current
      expect(updateMock).toHaveBeenCalledWith({ state: 'discard' })
      // reveal next
      expect(updateMock).toHaveBeenCalledWith({ state: 'revealed' })
      // update games.agenda_current_card_id
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ agenda_current_card_id: 'ag2' }))
    })

    it('throws when agenda deck is empty', async () => {
      const { db } = makeDbExtended({ nextAgendaDeckRow: null })
      await expect(interpretEffects([{ op: 'replace_agenda' }], CTX29B, db))
        .rejects.toThrow('Agenda deck empty')
    })
  })

  describe('add_votes', () => {
    it('spends trade goods and upserts vote row', async () => {
      const { db, updateMock, upsertMock } = makeDbExtended({
        player: { id: 'p1', trade_goods: 3, commodities: 0, vp: 0, technologies: [], action_card_count: 0 },
      })
      await interpretEffects(
        [{ op: 'add_votes' }],
        { ...CTX29B, selections: { vote_count: 2, vote_outcome: 'For' } },
        db,
      )
      expect(updateMock).toHaveBeenCalledWith({ trade_goods: 1 })
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ game_player_id: 'p1', vote_count: 2, choice: 'For' }),
        expect.anything(),
      )
    })

    it('throws when insufficient trade goods', async () => {
      const { db } = makeDbExtended({
        player: { id: 'p1', trade_goods: 1, commodities: 0, vp: 0, technologies: [], action_card_count: 0 },
      })
      await expect(
        interpretEffects([{ op: 'add_votes' }], { ...CTX29B, selections: { vote_count: 3, vote_outcome: 'For' } }, db)
      ).rejects.toThrow('Insufficient trade goods')
    })
  })

  describe('research_same_technology', () => {
    it('appends technology from windowContext to player technologies', async () => {
      const { db, updateMock } = makeDbExtended({
        player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: ['Neural Motivator'], action_card_count: 0 },
      })
      await interpretEffects(
        [{ op: 'research_same_technology' }],
        { ...CTX29B, windowContext: { technology_name: 'Sarween Tools' } },
        db,
      )
      expect(updateMock).toHaveBeenCalledWith({ technologies: ['Neural Motivator', 'Sarween Tools'] })
    })

    it('throws when technology already researched', async () => {
      const { db } = makeDbExtended({
        player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: ['Sarween Tools'], action_card_count: 0 },
      })
      await expect(
        interpretEffects([{ op: 'research_same_technology' }], { ...CTX29B, windowContext: { technology_name: 'Sarween Tools' } }, db)
      ).rejects.toThrow('Technology already researched')
    })

    it('throws when windowContext has no technology_name', async () => {
      const { db } = makeDbExtended()
      await expect(
        interpretEffects([{ op: 'research_same_technology' }], { ...CTX29B, windowContext: {} }, db)
      ).rejects.toThrow('technology_name missing from window context')
    })
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```

Expected: FAIL — ops not found (default case throws `Unknown op`).

- [ ] **Step 3: Extend `ResolveContext` and implement the 3 ops**

In `supabase/functions/_shared/abilityDsl.ts`:

**a) Add `windowContext` and `selections` to `ResolveContext`:**

```ts
export interface ResolveContext {
  gameId: string
  activatingPlayerId: string
  targetPlayerId?: string
  targetPlanetName?: string
  chosenAmount?: number
  chosenOption?: number
  selections?: Record<string, unknown>
  windowContext?: Record<string, unknown>
}
```

**b) Add the 3 cases inside the `switch (op.op)` in `interpretOp`, before the `default` case:**

```ts
    case 'replace_agenda': {
      // Fetch the game to get the current agenda deck card id
      const { data: game, error: gameErr } = await db
        .from('games')
        .select('agenda_current_card_id')
        .eq('id', context.gameId)
        .maybeSingle()
      if (gameErr || !game) throw new Error('replace_agenda: game not found')
      // Discard the current agenda deck row
      const { error: discardErr } = await db
        .from('game_agenda_deck')
        .update({ state: 'discard' })
        .eq('id', (game as Record<string, string>).agenda_current_card_id)
      if (discardErr) throw new Error(`replace_agenda: discard failed: ${discardErr.message}`)
      // Draw the next deck card
      const { data: nextCard, error: drawErr } = await db
        .from('game_agenda_deck')
        .select('id, agenda_id')
        .eq('game_id', context.gameId)
        .eq('state', 'deck')
        .order('deck_position', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (drawErr) throw new Error(`replace_agenda: deck query failed: ${drawErr.message}`)
      if (!nextCard) throw new Error('Agenda deck empty')
      const next = nextCard as Record<string, string>
      const { error: revealErr } = await db
        .from('game_agenda_deck')
        .update({ state: 'revealed' })
        .eq('id', next.id)
      if (revealErr) throw new Error(`replace_agenda: reveal failed: ${revealErr.message}`)
      const { error: updateGameErr } = await db
        .from('games')
        .update({ agenda_current_card_id: next.agenda_id })
        .eq('id', context.gameId)
      if (updateGameErr) throw new Error(`replace_agenda: game update failed: ${updateGameErr.message}`)
      break
    }

    case 'add_votes': {
      const sel = context.selections ?? {}
      const voteCount = sel.vote_count as number
      const voteOutcome = sel.vote_outcome as string
      if ((player.trade_goods as number) < voteCount) throw new Error('Insufficient trade goods')
      const { error: tgErr } = await db
        .from('game_players')
        .update({ trade_goods: (player.trade_goods as number) - voteCount })
        .eq('id', context.activatingPlayerId)
      if (tgErr) throw new Error(`add_votes: trade goods update failed: ${tgErr.message}`)
      // Get current agenda id
      const { data: game, error: gameErr } = await db
        .from('games')
        .select('agenda_current_card_id')
        .eq('id', context.gameId)
        .maybeSingle()
      if (gameErr || !game) throw new Error('add_votes: game not found')
      const { error: voteErr } = await db
        .from('game_agenda_votes')
        .upsert(
          {
            game_id: context.gameId,
            game_player_id: context.activatingPlayerId,
            agenda_id: (game as Record<string, string>).agenda_current_card_id,
            vote_count: voteCount,
            choice: voteOutcome,
          },
          { onConflict: 'game_id,game_player_id,agenda_id' },
        )
      if (voteErr) throw new Error(`add_votes: upsert failed: ${voteErr.message}`)
      break
    }

    case 'research_same_technology': {
      const wctx = context.windowContext ?? {}
      const techName = wctx.technology_name as string | undefined
      if (!techName) throw new Error('technology_name missing from window context')
      const currentTechs = (player.technologies as string[]) ?? []
      if (currentTechs.includes(techName)) throw new Error('Technology already researched')
      const { error } = await db
        .from('game_players')
        .update({ technologies: [...currentTechs, techName] })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`research_same_technology: update failed: ${error.message}`)
      break
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```

Expected: all tests PASS (existing tests unaffected; 8 new tests pass).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts ti4-companion-web/tests/lib/abilityDsl.test.js
git commit -m "feat(dsl): add windowContext to ResolveContext; implement replace_agenda, add_votes, research_same_technology ops"
```

---

## Task 3: Create `game-pass-action-window` Edge Function

This function handles game-level windows only. Phase 20 will add the `combat_id` branch for combat windows.

**Files:**
- Create: `supabase/functions/game-pass-action-window/index.ts`
- Create: `ti4-companion-web/tests/functions/game-pass-action-window.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/functions/game-pass-action-window.test.js`:

```js
// tests/functions/game-pass-action-window.test.js
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
import { handler } from '../../../supabase/functions/game-pass-action-window/index.ts'

const GAME_ID = 'game-uuid'
const USER_ID = 'user-uuid'
const PLAYER_ID = 'player-uuid'
const OTHER_ID = 'other-uuid'

const BASE_WINDOW = {
  type: 'when_agenda_revealed',
  eligible_player_ids: [PLAYER_ID, OTHER_ID],
  passed_player_ids: [],
  context: {},
}

function makeRequest(body) {
  return new Request('http://localhost/game-pass-action-window', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let updateGameMock

function mockDb({
  game = { id: GAME_ID, pending_action_window: BASE_WINDOW },
  player = { id: PLAYER_ID },
  updateError = null,
} = {}) {
  updateGameMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateError }),
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
            maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
          }),
        }),
      }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-pass-action-window', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 409 when no pending_action_window', async () => {
    mockDb({ game: { id: GAME_ID, pending_action_window: null } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: /no active window/i })
  })

  it('returns 409 when player not in eligible_player_ids', async () => {
    mockDb({ player: { id: 'stranger' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: /not eligible/i })
  })

  it('returns 409 when player already in passed_player_ids', async () => {
    mockDb({
      game: {
        id: GAME_ID,
        pending_action_window: { ...BASE_WINDOW, passed_player_ids: [PLAYER_ID] },
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: /already passed/i })
  })

  it('clears window when this is the last eligible player', async () => {
    // Only PLAYER_ID is eligible, so passing clears the window
    mockDb({
      game: {
        id: GAME_ID,
        pending_action_window: {
          ...BASE_WINDOW,
          eligible_player_ids: [PLAYER_ID],
          passed_player_ids: [],
        },
      },
    })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(updateGameMock).toHaveBeenCalledWith({ pending_action_window: null })
  })

  it('updates window with player added to passed_player_ids when others remain', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    expect(updateGameMock).toHaveBeenCalledWith({
      pending_action_window: {
        ...BASE_WINDOW,
        passed_player_ids: [PLAYER_ID],
      },
    })
  })
})
```

- [ ] **Step 2: Run to verify tests fail (file does not exist yet)**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-pass-action-window.test.js
```

Expected: FAIL — import error (no handler to import).

- [ ] **Step 3: Create the Edge Function**

Create `supabase/functions/game-pass-action-window/index.ts`:

```ts
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type ActionWindow = {
  type: string
  eligible_player_ids: string[]
  passed_player_ids: string[]
  context: Record<string, unknown>
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

  let body: { game_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('id, pending_action_window')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)

  const window = (game as Record<string, unknown>).pending_action_window as ActionWindow | null
  if (!window) return errorResponse('No active window', 409)

  const { data: player } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  const playerId = (player as Record<string, string> | null)?.id ?? ''

  if (!window.eligible_player_ids.includes(playerId)) {
    return errorResponse('Not eligible for this window', 409)
  }
  if (window.passed_player_ids.includes(playerId)) {
    return errorResponse('Already passed this window', 409)
  }

  const updatedPassed = [...window.passed_player_ids, playerId]
  const newWindow = updatedPassed.length === window.eligible_player_ids.length
    ? null
    : { ...window, passed_player_ids: updatedPassed }

  const { error: updateError } = await db
    .from('games')
    .update({ pending_action_window: newWindow })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Failed to update window: ${updateError.message}`, 500)

  return okResponse({})
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-pass-action-window.test.js
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-pass-action-window/index.ts ti4-companion-web/tests/functions/game-pass-action-window.test.js
git commit -m "feat(edge): create game-pass-action-window for game-level action windows"
```

---

## Task 4: Extend `game-play-action-card` with reactive timing branch

**Prerequisite:** Phase 29a must be complete. `supabase/functions/game-play-action-card/index.ts` must exist and `ti4-companion-web/tests/functions/game-play-action-card.test.js` must exist.

**Files:**
- Modify: `supabase/functions/game-play-action-card/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-play-action-card.test.js`

The `game-play-action-card` function (from Phase 29a) currently handles only `Action:` timing cards. We add a branch above that handles all other timings when a matching window is open.

Phase 29a built the function and tests. Now extend the test file's `mockDb` helper to support `pending_action_window` on `games`, then add 7 new test cases.

- [ ] **Step 1: Read the current test file and function**

```bash
cat ti4-companion-web/tests/functions/game-play-action-card.test.js
cat supabase/functions/game-play-action-card/index.ts
```

Understand the existing `mockDb` shape — specifically how `games` is mocked and what fields it returns.

- [ ] **Step 2: Extend `mockDb` in the test file to support `pending_action_window`**

Locate the `games` branch in `mockDb`. Add `pending_action_window` to the game object it returns. The default should be `null`. The helper should accept it as an override:

```js
// In mockDb params, change the game default to include pending_action_window:
game = {
  id: GAME_ID,
  phase: 'action',
  active_player_id: PLAYER_ID,
  round: 1,
  pending_action_window: null,  // ADD THIS
},
```

- [ ] **Step 3: Write 7 failing tests for the reactive branch**

In `ti4-companion-web/tests/functions/game-play-action-card.test.js`, add a new describe block at the end:

```js
describe('reactive timing branch (Phase 29b)', () => {
  const WINDOW = {
    type: 'when_agenda_revealed',
    eligible_player_ids: [PLAYER_ID],
    passed_player_ids: [],
    context: { agenda_id: 'ag1' },
  }
  const WHEN_CARD = {
    id: 'card-when',
    action_card_id: 'ac-when',
    timing: 'When an agenda is revealed:',
    ability: [{ op: 'replace_agenda' }],
  }

  it('409 when non-Action: card played with no open window', async () => {
    mockDb({ card: WHEN_CARD, game: { ...BASE_GAME, pending_action_window: null } })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: 'card-when' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: /no active window/i })
  })

  it('409 when card timing does not match open window type', async () => {
    const mismatchedWindow = { ...WINDOW, type: 'after_speaker_votes' }
    mockDb({ card: WHEN_CARD, game: { ...BASE_GAME, pending_action_window: mismatchedWindow } })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: 'card-when' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: /timing does not match/i })
  })

  it('409 when player not in eligible_player_ids', async () => {
    const otherWindow = { ...WINDOW, eligible_player_ids: ['other-player'] }
    mockDb({ card: WHEN_CARD, game: { ...BASE_GAME, pending_action_window: otherWindow } })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: 'card-when' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: /not eligible/i })
  })

  it('409 when non-Action: card has null ability', async () => {
    const noAbilityCard = { ...WHEN_CARD, ability: null }
    mockDb({ card: noAbilityCard, game: { ...BASE_GAME, pending_action_window: WINDOW } })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: 'card-when' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: /not implemented/i })
  })

  it('discards card and adds player to passed_player_ids', async () => {
    mockDb({ card: WHEN_CARD, game: { ...BASE_GAME, pending_action_window: WINDOW } })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: 'card-when', selections: {} }))
    expect(res.status).toBe(200)
    // deck row discarded
    expect(updateDeckMock).toHaveBeenCalledWith(expect.objectContaining({ state: 'discard', held_by_player_id: null }))
    // action_card_count decremented
    expect(updatePlayerMock).toHaveBeenCalledWith(expect.objectContaining({ action_card_count: expect.any(Number) }))
    // player added to passed_player_ids
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({ pending_action_window: null }))
  })

  it('clears window when all eligible players have acted', async () => {
    const oneEligible = { ...WINDOW, eligible_player_ids: [PLAYER_ID] }
    mockDb({ card: WHEN_CARD, game: { ...BASE_GAME, pending_action_window: oneEligible } })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: 'card-when' }))
    expect(res.status).toBe(200)
    expect(updateGameMock).toHaveBeenCalledWith(expect.objectContaining({ pending_action_window: null }))
  })

  it('updates window (not cleared) when other players are still eligible', async () => {
    const twoEligible = { ...WINDOW, eligible_player_ids: [PLAYER_ID, 'p2'], passed_player_ids: [] }
    mockDb({ card: WHEN_CARD, game: { ...BASE_GAME, pending_action_window: twoEligible } })
    const res = await handler(makeRequest({ game_id: GAME_ID, card_id: 'card-when' }))
    expect(res.status).toBe(200)
    expect(updateGameMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pending_action_window: expect.objectContaining({ passed_player_ids: [PLAYER_ID] }),
      })
    )
  })
})
```

- [ ] **Step 4: Run to verify the 7 new tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-play-action-card.test.js
```

Expected: 7 new tests FAIL; existing tests still PASS.

- [ ] **Step 5: Add the reactive timing branch to `game-play-action-card/index.ts`**

In `supabase/functions/game-play-action-card/index.ts`, after fetching the card row and before the `Action:` timing check, insert:

```ts
const TIMING_MAP: Record<string, string> = {
  when_agenda_revealed:        'When an agenda is revealed:',
  after_speaker_votes:         'After the speaker votes on an agenda:',
  when_voting_begins:          'When voting begins:',
  after_technology_researched: 'After a player researches a technology:',
}

// Reactive timing branch — runs for all non-Action: timings
const cardTiming = (card as Record<string, unknown>).timing as string | undefined
if (!cardTiming?.startsWith('Action:')) {
  const window = (game as Record<string, unknown>).pending_action_window as {
    type: string
    eligible_player_ids: string[]
    passed_player_ids: string[]
    context: Record<string, unknown>
  } | null

  if (!window) return errorResponse('No active window for this card timing', 409)
  if (cardTiming !== TIMING_MAP[window.type]) return errorResponse('Card timing does not match open window', 409)
  if (!window.eligible_player_ids.includes((player as Record<string, string>).id)) {
    return errorResponse('Not eligible for this window', 409)
  }
  if ((card as Record<string, unknown>).ability == null) {
    return errorResponse('Card effect not implemented', 409)
  }

  await interpretEffects(
    (card as Record<string, unknown[]>).ability as unknown[],
    {
      gameId: body.game_id as string,
      activatingPlayerId: (player as Record<string, string>).id,
      selections: (body.selections as Record<string, unknown>) ?? {},
      windowContext: window.context,
    },
    db,
  )

  // Discard the card
  const { error: discardErr } = await db
    .from('game_action_card_deck')
    .update({ state: 'discard', held_by_player_id: null })
    .eq('id', body.card_id as string)
  if (discardErr) return errorResponse(`Failed to discard card: ${discardErr.message}`, 500)

  const { data: playerRow } = await db
    .from('game_players')
    .select('action_card_count')
    .eq('id', (player as Record<string, string>).id)
    .maybeSingle()
  const currentCount = ((playerRow as Record<string, number> | null)?.action_card_count ?? 1)
  await db
    .from('game_players')
    .update({ action_card_count: Math.max(0, currentCount - 1) })
    .eq('id', (player as Record<string, string>).id)

  // Advance the window state
  const updatedPassed = [...window.passed_player_ids, (player as Record<string, string>).id]
  const newWindow = updatedPassed.length === window.eligible_player_ids.length
    ? null
    : { ...window, passed_player_ids: updatedPassed }

  await db.from('games').update({ pending_action_window: newWindow }).eq('id', body.game_id as string)

  return okResponse({ discarded: body.card_id })
}
// existing Action: branch continues...
```

Also ensure `game-play-action-card` selects `pending_action_window` when fetching the game. Find the game select call and add `pending_action_window` to the column list:

```ts
// Change existing game select, e.g.:
.select('id, phase, active_player_id, round, pending_action_window')
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-play-action-card.test.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/game-play-action-card/index.ts ti4-companion-web/tests/functions/game-play-action-card.test.js
git commit -m "feat(edge): add reactive timing branch to game-play-action-card for When/After windows"
```

---

## Task 5: Open `when_agenda_revealed` window in `game-draw-agenda`

**Files:**
- Modify: `supabase/functions/game-draw-agenda/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-draw-agenda.test.js`

The function currently returns `OK({ drawn: true, agenda_id })` after updating the game. We add window-opening logic before that return.

- [ ] **Step 1: Write 2 failing tests**

In `ti4-companion-web/tests/functions/game-draw-agenda.test.js`, extend `mockDb` to support an `actionCardDecks` table with eligible holders, then add:

```js
// At the bottom of the describe block, add:
describe('window opening', () => {
  it('opens when_agenda_revealed window when a player holds a matching card', async () => {
    // Extend mockDb to return eligible player from game_action_card_deck JOIN action_cards
    // We'll do this by adding a new mockDb call variant
    db.from.mockImplementation((table) => {
      if (table === 'games') return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_phase_step: 'agenda_1_voting', agenda_current_card_id: null, current_vote_sequence: 0 },
              error: null,
            }),
          }),
        }),
        update: updateGameMock,
      }
      if (table === 'game_players') return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: SPEAKER_PLAYER_ID }, error: null }),
            }),
          }),
        }),
      }
      if (table === 'game_agenda_deck') return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [{ id: CARD_ID, agenda_id: 'ag-uuid', deck_position: 0 }], error: null }),
              }),
            }),
          }),
        }),
        update: updateDeckMock,
      }
      if (table === 'game_action_card_deck') {
        // join result: one player holds a 'When an agenda is revealed:' card with ability
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({
                  data: [{ held_by_player_id: 'p2' }],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return {}
    })

    await handler(makeRequest({ game_id: GAME_ID }))
    expect(updateGameMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pending_action_window: expect.objectContaining({
          type: 'when_agenda_revealed',
          eligible_player_ids: ['p2'],
          passed_player_ids: [],
        }),
      })
    )
  })

  it('does not set pending_action_window when no player holds a matching card', async () => {
    // default mockDb — game_action_card_deck returns empty eligible list
    db.from.mockImplementation((table) => {
      if (table === 'games') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: GAME_ID, speaker_player_id: SPEAKER_PLAYER_ID, agenda_phase_step: 'agenda_1_voting', agenda_current_card_id: null, current_vote_sequence: 0 }, error: null }) }) }),
        update: updateGameMock,
      }
      if (table === 'game_players') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: SPEAKER_PLAYER_ID }, error: null }) }) }) }) }
      if (table === 'game_agenda_deck') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [{ id: CARD_ID, agenda_id: 'ag-uuid', deck_position: 0 }], error: null }) }) }) }) }), update: updateDeckMock }
      if (table === 'game_action_card_deck') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
      }
      return {}
    })

    await handler(makeRequest({ game_id: GAME_ID }))
    // updateGameMock should NOT have been called with pending_action_window
    const calls = updateGameMock.mock.calls
    const hasWindowSet = calls.some(([arg]) => arg && 'pending_action_window' in arg)
    expect(hasWindowSet).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-draw-agenda.test.js
```

Expected: 2 new tests FAIL; existing 7 tests PASS.

- [ ] **Step 3: Add window-opening logic to `game-draw-agenda/index.ts`**

In `supabase/functions/game-draw-agenda/index.ts`, replace the final `return okResponse(...)` line with:

```ts
  // Check for eligible 'When an agenda is revealed:' card holders
  const { data: eligibleRows } = await db
    .from('game_action_card_deck')
    .select('held_by_player_id, action_cards!inner(timing, ability)')
    .eq('game_id', body.game_id)
    .eq('state', 'hand')
    .not('action_cards.ability', 'is', null)
    .eq('action_cards.timing', 'When an agenda is revealed:')
  const eligibleIds = (eligibleRows ?? []).map((r: Record<string, string>) => r.held_by_player_id)

  if (eligibleIds.length > 0) {
    await db.from('games').update({
      pending_action_window: {
        type: 'when_agenda_revealed',
        eligible_player_ids: eligibleIds,
        passed_player_ids: [],
        context: { agenda_id: topCard.agenda_id },
      },
    }).eq('id', body.game_id)
  }

  return okResponse({ drawn: true, agenda_id: topCard.agenda_id })
```

Note: the eligible-player query uses a Supabase PostgREST inner join via `action_cards!inner(timing, ability)`. The `.eq('action_cards.timing', ...)` and `.not('action_cards.ability', ...)` syntax filters on the joined table.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-draw-agenda.test.js
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-draw-agenda/index.ts ti4-companion-web/tests/functions/game-draw-agenda.test.js
git commit -m "feat(edge): open when_agenda_revealed window in game-draw-agenda"
```

---

## Task 6: Open two windows in `game-cast-votes`

**Files:**
- Modify: `supabase/functions/game-cast-votes/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-cast-votes.test.js`

Two windows:
- `when_voting_begins` — before the first vote for an agenda
- `after_speaker_votes` — after the speaker casts their vote

- [ ] **Step 1: Write 4 failing tests**

In `ti4-companion-web/tests/functions/game-cast-votes.test.js`, add a helper that makes the action card deck mock return eligible holders:

```js
// Add near top of file, after the existing mockDb definition:
function mockWithEligibleCards({ eligibleTiming, eligiblePlayerId }) {
  // Reuse existing mockDb, but override game_action_card_deck
  const base = mockDb()  // sets up updateGameMock etc.
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_action_card_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({
                data: [{ held_by_player_id: eligiblePlayerId }],
                error: null,
              }),
            }),
          }),
        }),
      }
    }
    return origImpl(table)
  })
}
```

Then add a describe block:

```js
describe('window opening', () => {
  it('opens when_voting_begins window on first vote when a player holds a matching card', async () => {
    mockDb({ existingVotes: [] })  // no prior votes = first vote
    db.from.mockImplementationOnce = undefined  // handled below
    // Override game_action_card_deck for when_voting_begins cards
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'game_action_card_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({
                  data: [{ held_by_player_id: 'p3' }],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return origImpl(table)
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.window_opened).toBe('when_voting_begins')
    expect(updateGameMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pending_action_window: expect.objectContaining({ type: 'when_voting_begins' }),
      })
    )
  })

  it('does NOT cast vote when when_voting_begins window is opened (caller must re-submit)', async () => {
    mockDb({ existingVotes: [] })
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'game_action_card_deck') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [{ held_by_player_id: 'p3' }], error: null }) }) }) }) }
      }
      return origImpl(table)
    })

    await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    // upsert should NOT have been called since the window was opened instead
    expect(upsertVotesMock).not.toHaveBeenCalled()
  })

  it('opens after_speaker_votes window when speaker casts vote and a player holds matching card', async () => {
    // Simulate speaker (SPEAKER_PLAYER_ID = 'p1') casting the vote
    mockDb({
      game: {
        id: GAME_ID,
        speaker_player_id: SPEAKER_PLAYER_ID,
        agenda_current_card_id: AGENDA_ID,
        agenda_vote_current_player_id: SPEAKER_PLAYER_ID,
      },
      callerPlayer: { id: SPEAKER_PLAYER_ID },
      existingVotes: [{ game_player_id: 'p2' }],  // not zero, so when_voting_begins skipped
    })
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'game_action_card_deck') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [{ held_by_player_id: 'p3' }], error: null }) }) }) }) }
      }
      return origImpl(table)
    })

    const res = await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    expect(res.status).toBe(200)
    expect(updateGameMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pending_action_window: expect.objectContaining({ type: 'after_speaker_votes' }),
      })
    )
  })

  it('does NOT open after_speaker_votes when non-speaker casts vote', async () => {
    // default mockDb: callerPlayer is VOTER_PLAYER_ID (p2), speaker is p1
    mockDb({ existingVotes: [{ game_player_id: 'p1' }] })  // prior votes, so not first vote
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'game_action_card_deck') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [{ held_by_player_id: 'p3' }], error: null }) }) }) }) }
      }
      return origImpl(table)
    })

    await handler(makeRequest({ game_id: GAME_ID, choice: 'For', vote_count: 1 }))
    const windowCalls = updateGameMock.mock.calls.filter(([arg]) => arg && 'pending_action_window' in arg)
    expect(windowCalls).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-cast-votes.test.js
```

Expected: 4 new tests FAIL; existing 6 tests PASS.

- [ ] **Step 3: Add window logic to `game-cast-votes/index.ts`**

The function currently votes and returns. Add two window checks.

In `supabase/functions/game-cast-votes/index.ts`, after the `agenda_current_card_id` null-check and after loading `callerPlayer`, insert:

**Part A — `when_voting_begins` check (before casting the vote):**

```ts
  // Check for when_voting_begins window on first vote
  const { data: priorVotes } = await db
    .from('game_agenda_votes')
    .select('game_player_id')
    .eq('game_id', body.game_id)
    .eq('agenda_id', game.agenda_current_card_id)
  const isFirstVote = (priorVotes ?? []).length === 0

  if (isFirstVote) {
    const { data: whenVotingRows } = await db
      .from('game_action_card_deck')
      .select('held_by_player_id, action_cards!inner(timing, ability)')
      .eq('game_id', body.game_id)
      .eq('state', 'hand')
      .not('action_cards.ability', 'is', null)
      .eq('action_cards.timing', 'When voting begins:')
    const whenVotingEligible = (whenVotingRows ?? []).map((r: Record<string, string>) => r.held_by_player_id)

    if (whenVotingEligible.length > 0) {
      const { error: winErr } = await db.from('games').update({
        pending_action_window: {
          type: 'when_voting_begins',
          eligible_player_ids: whenVotingEligible,
          passed_player_ids: [],
          context: { agenda_id: game.agenda_current_card_id },
        },
      }).eq('id', body.game_id)
      if (winErr) return errorResponse(`Failed to open window: ${winErr.message}`, 500)
      return okResponse({ window_opened: 'when_voting_begins' })
      // Caller must re-submit after the window resolves
    }
  }
```

**Part B — `after_speaker_votes` check (after casting the vote, at the end of the handler):**

Replace the final `return okResponse(...)` with:

```ts
  // If the speaker just voted, check for after_speaker_votes window.
  // game.speaker_player_id stores a game_player_id (same type as callerPlayer.id).
  if (callerPlayer.id === game.speaker_player_id) {
    const { data: afterSpeakerRows } = await db
      .from('game_action_card_deck')
      .select('held_by_player_id, action_cards!inner(timing, ability)')
      .eq('game_id', body.game_id)
      .eq('state', 'hand')
      .not('action_cards.ability', 'is', null)
      .eq('action_cards.timing', 'After the speaker votes on an agenda:')
    const afterSpeakerEligible = (afterSpeakerRows ?? []).map((r: Record<string, string>) => r.held_by_player_id)

    if (afterSpeakerEligible.length > 0) {
      await db.from('games').update({
        pending_action_window: {
          type: 'after_speaker_votes',
          eligible_player_ids: afterSpeakerEligible,
          passed_player_ids: [],
          context: { agenda_id: game.agenda_current_card_id },
        },
      }).eq('id', body.game_id)
    }
  }

  return okResponse({ voted: true, all_voted: allVoted })
```

Ensure the game select includes `speaker_player_id`:

```ts
.select('id, speaker_player_id, agenda_current_card_id, agenda_vote_current_player_id')
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-cast-votes.test.js
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-cast-votes/index.ts ti4-companion-web/tests/functions/game-cast-votes.test.js
git commit -m "feat(edge): open when_voting_begins and after_speaker_votes windows in game-cast-votes"
```

---

## Task 7: Refactor `game-research-technology` to export `handler`, then add window

The function currently uses `Deno.serve(async (req) => {...})` — an anonymous function that cannot be imported in tests. Refactor it to the project standard (`export async function handler`, then `Deno.serve(handler)` at the bottom). Then add the `after_technology_researched` window.

**Files:**
- Modify: `supabase/functions/game-research-technology/index.ts`
- Create: `ti4-companion-web/tests/functions/game-research-technology.test.js`

- [ ] **Step 1: Read the full current `game-research-technology/index.ts`**

```bash
cat supabase/functions/game-research-technology/index.ts
```

Identify the `Deno.serve(async (req) => {` opening line and the closing `})` at the end.

- [ ] **Step 2: Create a test file that will fail because `handler` doesn't exist yet**

Create `ti4-companion-web/tests/functions/game-research-technology.test.js`:

```js
// tests/functions/game-research-technology.test.js
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
import { handler } from '../../../supabase/functions/game-research-technology/index.ts'

const GAME_ID = 'game-uuid'
const USER_ID = 'user-uuid'
const PLAYER_ID = 'player-uuid'
const TECH_NAME = 'Neural Motivator'

function makeRequest(body) {
  return new Request('http://localhost/game-research-technology', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

let updatePlayerMock, updatePlanetsMock, updateGameMock

function mockDb({
  game = { id: GAME_ID, status: 'active', expansions: { base: true, pok: false, te: false } },
  tech = { name: TECH_NAME, technology_type: 'green', prerequisites: {}, expansion: 'base' },
  allTechs = [{ name: TECH_NAME, technology_type: 'green' }],
  player = { id: PLAYER_ID, technologies: [] },
  planets = [],
  updatePlayerError = null,
  updateGameError = null,
} = {}) {
  updatePlayerMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updatePlayerError }) })
  updatePlanetsMock = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) })
  updateGameMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateGameError }) })

  db.from.mockImplementation((table) => {
    if (table === 'games') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: game, error: null }) }) }),
      update: updateGameMock,
    }
    if (table === 'technologies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: tech, error: null }) }),
          then: (onFulfilled) => Promise.resolve({ data: allTechs, error: null }).then(onFulfilled),
        }),
      }
    }
    if (table === 'game_players') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }) }) }),
      update: updatePlayerMock,
    }
    if (table === 'game_player_planets') return {
      select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: planets, error: null }) }),
      update: updatePlanetsMock,
    }
    if (table === 'game_action_card_deck') return {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
})

describe('game-research-technology', () => {
  it('returns 401 for unauthenticated requests', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
    expect(res.status).toBe(401)
  })

  it('returns 409 when technology already researched', async () => {
    mockDb({ player: { id: PLAYER_ID, technologies: [TECH_NAME] } })
    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
    expect(res.status).toBe(409)
  })

  it('appends technology to player technologies on success', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
    expect(res.status).toBe(200)
    expect(updatePlayerMock).toHaveBeenCalledWith({ technologies: [TECH_NAME] })
  })

  describe('after_technology_researched window', () => {
    it('opens window when another player holds a matching card', async () => {
      db.from.mockImplementation((table) => {
        if (table === 'game_action_card_deck') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [{ held_by_player_id: 'p2' }], error: null }) }) }) }) }
        }
        // fall through to default mockDb setup
        return mockDb().db.from(table) // Note: each test calls mockDb() in beforeEach, so re-use its implementation
      })
      // Re-setup the base mock since we overrode db.from above
      mockDb()
      const origImpl = db.from.getMockImplementation()
      db.from.mockImplementation((table) => {
        if (table === 'game_action_card_deck') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [{ held_by_player_id: 'p2' }], error: null }) }) }) }) }
        }
        return origImpl(table)
      })

      const res = await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
      expect(res.status).toBe(200)
      expect(updateGameMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pending_action_window: expect.objectContaining({
            type: 'after_technology_researched',
            eligible_player_ids: ['p2'],
            context: expect.objectContaining({ technology_name: TECH_NAME }),
          }),
        })
      )
    })

    it('does NOT open window when no other player holds a matching card', async () => {
      // default mockDb returns empty eligible list
      await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
      const windowCalls = updateGameMock.mock.calls.filter(([arg]) => arg && 'pending_action_window' in arg)
      expect(windowCalls).toHaveLength(0)
    })

    it('excludes the researching player from eligibility', async () => {
      // Eligible row points to the SAME player who researched
      mockDb()
      const origImpl = db.from.getMockImplementation()
      db.from.mockImplementation((table) => {
        if (table === 'game_action_card_deck') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
          // The exclusion is enforced in the query (.neq('held_by_player_id', player.id)),
          // so returning [] means no window opens
        }
        return origImpl(table)
      })
      await handler(makeRequest({ game_id: GAME_ID, tech_name: TECH_NAME }))
      const windowCalls = updateGameMock.mock.calls.filter(([arg]) => arg && 'pending_action_window' in arg)
      expect(windowCalls).toHaveLength(0)
    })
  })
})
```

- [ ] **Step 3: Run to verify the tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-research-technology.test.js
```

Expected: FAIL — `handler` is not exported.

- [ ] **Step 4: Refactor the function to export `handler`**

In `supabase/functions/game-research-technology/index.ts`:

Change the opening line from:
```ts
Deno.serve(async (req: Request) => {
```

To:
```ts
export async function handler(req: Request): Promise<Response> {
```

Change the closing:
```ts
})
```

To:
```ts
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 5: Run basic tests to verify refactor is clean**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-research-technology.test.js
```

Expected: the first 3 tests (401, 409, append) PASS; window tests FAIL (logic not added yet).

- [ ] **Step 6: Add `after_technology_researched` window logic**

In `supabase/functions/game-research-technology/index.ts`, replace the final `return okResponse({ researched: true })` with:

```ts
  // Check for after_technology_researched window (exclude the researching player)
  const { data: eligibleRows } = await db
    .from('game_action_card_deck')
    .select('held_by_player_id, action_cards!inner(timing, ability)')
    .eq('game_id', body.game_id)
    .eq('state', 'hand')
    .neq('held_by_player_id', player.id)
    .not('action_cards.ability', 'is', null)
    .eq('action_cards.timing', 'After a player researches a technology:')
  const eligibleIds = (eligibleRows ?? []).map((r: Record<string, string>) => r.held_by_player_id)

  if (eligibleIds.length > 0) {
    await db.from('games').update({
      pending_action_window: {
        type: 'after_technology_researched',
        eligible_player_ids: eligibleIds,
        passed_player_ids: [],
        context: { technology_name: body.tech_name },
      },
    }).eq('id', body.game_id)
  }

  return okResponse({ researched: true })
```

Also make sure the game select includes `id` so the games update can `.eq('id', body.game_id)`. The current select uses `.eq('id', body.game_id)` but only selects `status, expansions`. Change to:

```ts
.select('id, status, expansions')
```

- [ ] **Step 7: Run all research-technology tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-research-technology.test.js
```

Expected: all 6 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/game-research-technology/index.ts ti4-companion-web/tests/functions/game-research-technology.test.js
git commit -m "feat(edge): export handler from game-research-technology; open after_technology_researched window"
```

---

## Task 8: Add `passActionWindow` (and `playActionCard`) to `edgeFunctions.js`

**Files:**
- Modify: `src/lib/edgeFunctions.js`
- Create: `ti4-companion-web/tests/lib/edgeFunctions.phase29b.test.js`

Note: If Phase 29a already added `playActionCard`, skip the `playActionCard` part of this task (check the current file first).

- [ ] **Step 1: Check whether `playActionCard` is already in `edgeFunctions.js`**

```bash
grep -n "playActionCard" ti4-companion-web/src/lib/edgeFunctions.js
```

If found, only add `passActionWindow`. If not found, add both.

- [ ] **Step 2: Write failing tests**

Create `ti4-companion-web/tests/lib/edgeFunctions.phase29b.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { passActionWindow } from '../../src/lib/edgeFunctions.js'

// Only import playActionCard if Phase 29a hasn't added it yet:
// import { playActionCard } from '../../src/lib/edgeFunctions.js'

describe('Phase 29b edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passActionWindow calls game-pass-action-window with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: {}, error: null })
    await passActionWindow('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-pass-action-window', {
      body: { game_id: 'g1' },
    })
  })
})
```

If `playActionCard` was not added by Phase 29a, also add to the test file:

```js
  it('playActionCard calls game-play-action-card with game_id, card_id, selections', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { discarded: 'c1' }, error: null })
    await playActionCard('g1', 'c1', { vote_count: 2 })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-play-action-card', {
      body: { game_id: 'g1', card_id: 'c1', selections: { vote_count: 2 } },
    })
  })
```

- [ ] **Step 3: Run to verify tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/lib/edgeFunctions.phase29b.test.js
```

Expected: FAIL — `passActionWindow` not exported.

- [ ] **Step 4: Add the exports to `edgeFunctions.js`**

At the end of `src/lib/edgeFunctions.js`, add:

```js
export const passActionWindow = (gameId) =>
  callFunction('game-pass-action-window', { game_id: gameId })
```

If `playActionCard` is not present, also add:

```js
export const playActionCard = (gameId, cardId, selections) =>
  callFunction('game-play-action-card', { game_id: gameId, card_id: cardId, selections })
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/lib/edgeFunctions.phase29b.test.js
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/edgeFunctions.js ti4-companion-web/tests/lib/edgeFunctions.phase29b.test.js
git commit -m "feat(client): add passActionWindow (and playActionCard if needed) to edgeFunctions"
```

---

## Task 9: Create `ActionWindowBanner` component

**Files:**
- Create: `src/components/game/ActionWindowBanner.jsx`
- Create: `ti4-companion-web/tests/components/ActionWindowBanner.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `ti4-companion-web/tests/components/ActionWindowBanner.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ActionWindowBanner from '../../src/components/game/ActionWindowBanner.jsx'

const PLAYER_ID = 'p1'
const OTHER_ID = 'p2'

const BASE_WINDOW = {
  type: 'when_agenda_revealed',
  eligible_player_ids: [PLAYER_ID],
  passed_player_ids: [],
  context: {},
}

const MATCHING_CARD = {
  id: 'deck1',
  action_card_id: 'ac1',
  action_cards: {
    name: 'Veto',
    timing: 'When an agenda is revealed:',
    ability: [{ op: 'replace_agenda' }],
  },
}

const NON_MATCHING_CARD = {
  id: 'deck2',
  action_card_id: 'ac2',
  action_cards: {
    name: 'Bribery',
    timing: 'After the speaker votes on an agenda:',
    ability: [{ op: 'add_votes' }],
  },
}

const NULL_ABILITY_CARD = {
  id: 'deck3',
  action_card_id: 'ac3',
  action_cards: {
    name: 'Unknown Card',
    timing: 'When an agenda is revealed:',
    ability: null,
  },
}

describe('ActionWindowBanner', () => {
  it('renders nothing when window is null', () => {
    const { container } = render(
      <ActionWindowBanner
        window={null}
        currentPlayerId={PLAYER_ID}
        myCards={[MATCHING_CARD]}
        onPlayCard={vi.fn()}
        onPass={vi.fn()}
        loading={false}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when currentPlayerId not in eligible_player_ids', () => {
    const { container } = render(
      <ActionWindowBanner
        window={{ ...BASE_WINDOW, eligible_player_ids: [OTHER_ID] }}
        currentPlayerId={PLAYER_ID}
        myCards={[MATCHING_CARD]}
        onPlayCard={vi.fn()}
        onPass={vi.fn()}
        loading={false}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when currentPlayerId already in passed_player_ids', () => {
    const { container } = render(
      <ActionWindowBanner
        window={{ ...BASE_WINDOW, passed_player_ids: [PLAYER_ID] }}
        currentPlayerId={PLAYER_ID}
        myCards={[MATCHING_CARD]}
        onPlayCard={vi.fn()}
        onPass={vi.fn()}
        loading={false}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders banner with correct label for eligible player', () => {
    render(
      <ActionWindowBanner
        window={BASE_WINDOW}
        currentPlayerId={PLAYER_ID}
        myCards={[MATCHING_CARD]}
        onPlayCard={vi.fn()}
        onPass={vi.fn()}
        loading={false}
      />
    )
    expect(screen.getByText(/agenda has been revealed/i)).toBeTruthy()
  })

  it('lists only cards matching the window timing with non-null ability', () => {
    render(
      <ActionWindowBanner
        window={BASE_WINDOW}
        currentPlayerId={PLAYER_ID}
        myCards={[MATCHING_CARD, NON_MATCHING_CARD, NULL_ABILITY_CARD]}
        onPlayCard={vi.fn()}
        onPass={vi.fn()}
        loading={false}
      />
    )
    expect(screen.getByTestId('window-play-deck1')).toBeTruthy()
    expect(screen.queryByTestId('window-play-deck2')).toBeNull()
    expect(screen.queryByTestId('window-play-deck3')).toBeNull()
  })

  it('calls onPlayCard with card id when a card button is clicked', () => {
    const onPlayCard = vi.fn()
    render(
      <ActionWindowBanner
        window={BASE_WINDOW}
        currentPlayerId={PLAYER_ID}
        myCards={[MATCHING_CARD]}
        onPlayCard={onPlayCard}
        onPass={vi.fn()}
        loading={false}
      />
    )
    fireEvent.click(screen.getByTestId('window-play-deck1'))
    expect(onPlayCard).toHaveBeenCalledWith('deck1', {})
  })

  it('calls onPass when Pass button is clicked', () => {
    const onPass = vi.fn()
    render(
      <ActionWindowBanner
        window={BASE_WINDOW}
        currentPlayerId={PLAYER_ID}
        myCards={[MATCHING_CARD]}
        onPlayCard={vi.fn()}
        onPass={onPass}
        loading={false}
      />
    )
    fireEvent.click(screen.getByTestId('window-pass'))
    expect(onPass).toHaveBeenCalled()
  })

  it('disables Pass button when loading is true', () => {
    render(
      <ActionWindowBanner
        window={BASE_WINDOW}
        currentPlayerId={PLAYER_ID}
        myCards={[MATCHING_CARD]}
        onPlayCard={vi.fn()}
        onPass={vi.fn()}
        loading={true}
      />
    )
    expect(screen.getByTestId('window-pass').disabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/components/ActionWindowBanner.test.jsx
```

Expected: FAIL — component file does not exist.

- [ ] **Step 3: Create `ActionWindowBanner.jsx`**

Create `src/components/game/ActionWindowBanner.jsx`:

```jsx
const WINDOW_LABELS = {
  when_agenda_revealed:        'An agenda has been revealed',
  after_speaker_votes:         'The speaker has voted',
  when_voting_begins:          'Voting is about to begin',
  after_technology_researched: 'A player researched a technology',
}

const TIMING_MAP = {
  when_agenda_revealed:        'When an agenda is revealed:',
  after_speaker_votes:         'After the speaker votes on an agenda:',
  when_voting_begins:          'When voting begins:',
  after_technology_researched: 'After a player researches a technology:',
}

export default function ActionWindowBanner({ window, currentPlayerId, myCards, onPlayCard, onPass, loading }) {
  if (!window) return null
  if (!window.eligible_player_ids.includes(currentPlayerId)) return null
  if (window.passed_player_ids.includes(currentPlayerId)) return null

  const matchingCards = (myCards ?? []).filter(
    c => c.action_cards?.timing === TIMING_MAP[window.type] && c.action_cards?.ability != null
  )

  return (
    <div className="fixed inset-0 bg-void/60 flex items-center justify-center z-40 p-4">
      <div className="panel w-full max-w-sm flex flex-col gap-3">
        <p className="label">{WINDOW_LABELS[window.type] ?? window.type}</p>
        <p className="text-dim text-xs font-body">Play a card or pass</p>
        <div className="flex flex-col gap-1">
          {matchingCards.map(card => (
            <button
              key={card.id}
              data-testid={`window-play-${card.id}`}
              className="btn-ghost text-sm w-full text-left"
              onClick={() => onPlayCard(card.id, {})}
            >
              {card.action_cards.name}
            </button>
          ))}
        </div>
        <button
          data-testid="window-pass"
          className="btn-ghost text-sm self-end"
          onClick={onPass}
          disabled={!!loading}
        >
          Pass
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/components/ActionWindowBanner.test.jsx
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/ActionWindowBanner.jsx ti4-companion-web/tests/components/ActionWindowBanner.test.jsx
git commit -m "feat(ui): add ActionWindowBanner component for reactive action card windows"
```

---

## Task 10: Wire `ActionWindowBanner` into `GameScreen`

**Files:**
- Modify: `src/components/game/GameScreen.jsx`

The banner needs:
- `window` — `game.pending_action_window` from `useGame`
- `currentPlayerId` — `currentPlayer.id`
- `myCards` — `myCards` (already destructured from `useGame`)
- `onPlayCard` — calls `playActionCard` then sets loading
- `onPass` — calls `passActionWindow` then sets loading
- `loading` — a new state flag

- [ ] **Step 1: Read `GameScreen.jsx` around the return statement and existing imports**

```bash
cat ti4-companion-web/src/components/game/GameScreen.jsx
```

Find: the import section, the `useGame` destructure, and where the first modal (`<TradeOfferBanner>` or similar) is rendered.

- [ ] **Step 2: Add the import and state**

In `src/components/game/GameScreen.jsx`:

Add to the imports at the top:
```js
import ActionWindowBanner from './ActionWindowBanner.jsx'
import { playActionCard, passActionWindow } from '../../lib/edgeFunctions.js'
```

Add a new state variable after the existing `useState` declarations:
```js
const [windowLoading, setWindowLoading] = useState(false)
```

- [ ] **Step 3: Add the handlers**

After the existing `handleConfirmAbility` function, add:

```js
  async function handlePlayWindowCard(cardId, selections) {
    setWindowLoading(true)
    try {
      await playActionCard(game.id, cardId, selections)
    } finally {
      setWindowLoading(false)
    }
  }

  async function handlePassWindow() {
    setWindowLoading(true)
    try {
      await passActionWindow(game.id)
    } finally {
      setWindowLoading(false)
    }
  }
```

- [ ] **Step 4: Render the banner in the JSX**

In the `return (...)` block, add `<ActionWindowBanner>` near the top of the modal stack (after `<TradeOfferBanner>` and before any combat modals):

```jsx
      <ActionWindowBanner
        window={game?.pending_action_window ?? null}
        currentPlayerId={currentPlayer?.id}
        myCards={myCards}
        onPlayCard={handlePlayWindowCard}
        onPass={handlePassWindow}
        loading={windowLoading}
      />
```

- [ ] **Step 5: Commit**

```bash
git add src/components/game/GameScreen.jsx
git commit -m "feat(ui): wire ActionWindowBanner into GameScreen"
```

---

## Task 11: Full test run, deploy, and mark done

**Files:**
- Modify: `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`

- [ ] **Step 1: Run the full test suite**

```bash
cd ti4-companion-web && npm test
```

Expected: all existing tests pass plus all new tests from this phase.

- [ ] **Step 2: Deploy all new and modified Edge Functions**

```bash
supabase functions deploy game-pass-action-window --no-verify-jwt
supabase functions deploy game-play-action-card --no-verify-jwt
supabase functions deploy game-draw-agenda --no-verify-jwt
supabase functions deploy game-cast-votes --no-verify-jwt
supabase functions deploy game-research-technology --no-verify-jwt
```

- [ ] **Step 3: Mark Phase 29b rows as `done` in `_index.md`**

In `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`, change all Phase 29b rows from `planned` to `done`:
- `migration-042-action-window`
- `shared-abilityDsl-p29b`
- `fn-game-play-action-card-p29b`
- `fn-game-pass-action-window-p29b`
- `fn-game-draw-agenda-p29b`
- `fn-game-cast-votes-p29b`
- `fn-game-research-technology-p29b`
- `component-ActionWindowBanner`
- `client-edgeFunctions-p29a` (if `passActionWindow` was added in this phase)

- [ ] **Step 4: Commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "docs: mark Phase 29b spec files as done in main_plan index"
```
