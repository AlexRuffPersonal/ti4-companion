# Phase 4b — Action Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add action card draw, hand management, and discard to the in-game UI, with the deck initialized on game start and privacy enforced at the database level.

**Architecture:** `game-start` initializes the action card deck; two new Edge Functions (`game-draw-action-card`, `game-discard-action-card`) mutate deck state and maintain a denormalized count on `game_players`. `useGame` loads the current player's hand via a filtered query and re-fetches on Realtime deck changes. `ActionCardModal` is an owner-only modal; `deriveHandState` is a pure function computing over-limit state. Card counts flow to all players via the existing `game_players` Realtime subscription.

**Tech Stack:** React 19, Vite, Tailwind CSS 3, Supabase JS v2, Vitest 4, @testing-library/react, Deno/TypeScript (Edge Functions)

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/009_phase4b.sql` |
| Modify | `supabase/functions/game-start/index.ts` |
| Create | `supabase/functions/game-draw-action-card/index.ts` |
| Create | `supabase/functions/game-discard-action-card/index.ts` |
| Modify | `ti4-companion-web/src/lib/edgeFunctions.js` |
| Modify | `ti4-companion-web/src/hooks/useGame.js` |
| Create | `ti4-companion-web/src/lib/handState.js` |
| Create | `ti4-companion-web/src/components/game/ActionCardModal.jsx` |
| Modify | `ti4-companion-web/src/components/game/GameScreen.jsx` |
| Modify | `ti4-companion-web/src/components/game/MyPanelSection.jsx` |
| Modify | `ti4-companion-web/src/components/game/ScoreboardSection.jsx` |
| Create | `ti4-companion-web/tests/lib/handState.test.js` |
| Create | `ti4-companion-web/tests/components/game/ActionCardModal.test.jsx` |
| Modify | `ti4-companion-web/tests/components/game/MyPanelSection.test.jsx` |
| Modify | `ti4-companion-web/tests/components/game/ScoreboardSection.test.jsx` |
| Modify | `ti4-companion-web/tests/functions/game-start.test.js` |
| Create | `ti4-companion-web/tests/lib/edgeFunctions.phase4b.test.js` |
| Create | `ti4-companion-web/tests/hooks/useGame.phase4b.test.js` |

---

## Task 1: Apply Migration 009

**Files:**
- Create: `supabase/migrations/009_phase4b.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Denormalized card count — publicly visible via game_players Realtime subscription.
-- Updated atomically by draw/discard Edge Functions.
ALTER TABLE public.game_players
  ADD COLUMN action_card_count INTEGER NOT NULL DEFAULT 0;

-- RLS: held cards are private to their owner; deck and discard rows are public.
CREATE POLICY "action_card_deck_select" ON public.game_action_card_deck
  FOR SELECT USING (
    state != 'held'
    OR held_by_player_id = (
      SELECT id FROM public.game_players
      WHERE game_id = game_action_card_deck.game_id
        AND user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration**

Open Supabase dashboard → SQL Editor, paste and run the SQL above.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_phase4b.sql
git commit -m "feat: add migration 009 — action_card_count on game_players, RLS on game_action_card_deck"
```

---

## Task 2: Update game-start — initialise action card deck

**Files:**
- Modify: `supabase/functions/game-start/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-start.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/functions/game-start.test.js`, replace the `mockDb` function entirely (renaming `insertError` → `insertObjError` and adding action card table mocks), then add two new tests inside the existing `describe` block.

Replace `mockDb` with:

```javascript
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
  })
  return { actionCardInsertMock }
}
```

Add these two tests inside the `describe('game-start', ...)` block:

```javascript
  it('inserts action cards into game_action_card_deck with correct copy counts', async () => {
    const { actionCardInsertMock } = mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(200)
    // ac-1 has quantity 2 → 2 copies; ac-2 has quantity 1 → 1 copy = 3 total
    expect(actionCardInsertMock).toHaveBeenCalledOnce()
    const inserted = actionCardInsertMock.mock.calls[0][0]
    expect(inserted).toHaveLength(3)
    expect(inserted.filter(r => r.action_card_id === 'ac-1')).toHaveLength(2)
    expect(inserted.filter(r => r.action_card_id === 'ac-2')).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ game_id: GAME_ID, state: 'deck' })
    const ac1Copies = inserted.filter(r => r.action_card_id === 'ac-1').map(r => r.copy_index).sort()
    expect(ac1Copies).toEqual([0, 1])
  })

  it('returns 500 when action card insert fails', async () => {
    mockDb({ insertActionError: { message: 'insert failed' } })
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(500)
  })
```

- [ ] **Step 2: Run tests to confirm the two new tests fail**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-start.test.js
```

Expected: the two new tests fail; existing tests still pass.

- [ ] **Step 3: Replace `supabase/functions/game-start/index.ts`**

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

  const activeExpansions = Object.entries(game.expansions ?? {})
    .filter(([, active]) => active)
    .map(([exp]) => exp)

  // Initialise public objective decks (filtered by active expansions)
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

  const { error: updateError } = await db
    .from('games')
    .update({ status: 'active' })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Failed to start game: ${updateError.message}`, 500)

  return okResponse({ started: true })
})
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
npx vitest run tests/functions/game-start.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Deploy game-start**

```bash
supabase functions deploy game-start --no-verify-jwt
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-start/index.ts ti4-companion-web/tests/functions/game-start.test.js
git commit -m "feat: initialise action card deck in game-start"
```

---

## Task 3: Create game-draw-action-card

**Files:**
- Create: `supabase/functions/game-draw-action-card/index.ts`

- [ ] **Step 1: Create the function**

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

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, action_card_count')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: topCard, error: deckError } = await db
    .from('game_action_card_deck')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (deckError) return errorResponse('Database error', 500)
  if (!topCard) return errorResponse('Action card deck is empty', 409)

  const { error: updateCardError } = await db
    .from('game_action_card_deck')
    .update({ state: 'held', held_by_player_id: player.id, deck_position: null })
    .eq('id', topCard.id)
  if (updateCardError) return errorResponse('Database error', 500)

  const { error: updatePlayerError } = await db
    .from('game_players')
    .update({ action_card_count: player.action_card_count + 1 })
    .eq('id', player.id)
  if (updatePlayerError) return errorResponse('Database error', 500)

  return okResponse({ drawn: true })
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy game-draw-action-card --no-verify-jwt
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/game-draw-action-card/index.ts
git commit -m "feat: add game-draw-action-card Edge Function"
```

---

## Task 4: Create game-discard-action-card

**Files:**
- Create: `supabase/functions/game-discard-action-card/index.ts`

- [ ] **Step 1: Create the function**

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

  let body: { game_id?: unknown; card_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.card_id || typeof body.card_id !== 'string') return errorResponse("'card_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, action_card_count')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: card, error: cardError } = await db
    .from('game_action_card_deck')
    .select('id, state, held_by_player_id')
    .eq('id', body.card_id)
    .maybeSingle()
  if (cardError) return errorResponse('Database error', 500)
  if (!card) return errorResponse('Card not found', 404)
  if (card.state !== 'held' || card.held_by_player_id !== player.id) {
    return errorResponse('Card is not held by you', 403)
  }

  const { error: updateCardError } = await db
    .from('game_action_card_deck')
    .update({ state: 'discarded', held_by_player_id: null })
    .eq('id', card.id)
  if (updateCardError) return errorResponse('Database error', 500)

  const { error: updatePlayerError } = await db
    .from('game_players')
    .update({ action_card_count: Math.max(0, player.action_card_count - 1) })
    .eq('id', player.id)
  if (updatePlayerError) return errorResponse('Database error', 500)

  return okResponse({ discarded: true })
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy game-discard-action-card --no-verify-jwt
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/game-discard-action-card/index.ts
git commit -m "feat: add game-discard-action-card Edge Function"
```

---

## Task 5: Add edgeFunctions wrappers + tests

**Files:**
- Modify: `ti4-companion-web/src/lib/edgeFunctions.js`
- Create: `ti4-companion-web/tests/lib/edgeFunctions.phase4b.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/edgeFunctions.phase4b.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { drawActionCard, discardActionCard } from '../../src/lib/edgeFunctions.js'

describe('Phase 4b edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('drawActionCard calls game-draw-action-card with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { drawn: true }, error: null })
    await drawActionCard('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-draw-action-card', { body: { game_id: 'g1' } })
  })

  it('discardActionCard calls game-discard-action-card with game_id and card_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { discarded: true }, error: null })
    await discardActionCard('g1', 'card-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-discard-action-card', {
      body: { game_id: 'g1', card_id: 'card-uuid' },
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/lib/edgeFunctions.phase4b.test.js
```

Expected: FAIL — `drawActionCard` and `discardActionCard` are not exported.

- [ ] **Step 3: Add wrappers to `src/lib/edgeFunctions.js`**

Add these two lines before the final `export { callFunction }` line:

```javascript
export const drawActionCard = (gameId) =>
  callFunction('game-draw-action-card', { game_id: gameId })

export const discardActionCard = (gameId, cardId) =>
  callFunction('game-discard-action-card', { game_id: gameId, card_id: cardId })
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/edgeFunctions.phase4b.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/edgeFunctions.js tests/lib/edgeFunctions.phase4b.test.js
git commit -m "feat: add drawActionCard and discardActionCard edge function wrappers"
```

---

## Task 6: Create handState pure logic + tests (TDD)

**Files:**
- Create: `ti4-companion-web/src/lib/handState.js`
- Create: `ti4-companion-web/tests/lib/handState.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/handState.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { deriveHandState } from '../../src/lib/handState.js'

function makeCards(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `card-${i}` }))
}

describe('deriveHandState', () => {
  it('returns overLimit false and mustDiscard false when hand is empty', () => {
    const result = deriveHandState([])
    expect(result.overLimit).toBe(false)
    expect(result.mustDiscard).toBe(false)
    expect(result.cards).toHaveLength(0)
  })

  it('returns overLimit false and mustDiscard false at exactly 7 cards', () => {
    const result = deriveHandState(makeCards(7))
    expect(result.overLimit).toBe(false)
    expect(result.mustDiscard).toBe(false)
  })

  it('returns overLimit true and mustDiscard true at 8 cards', () => {
    const result = deriveHandState(makeCards(8))
    expect(result.overLimit).toBe(true)
    expect(result.mustDiscard).toBe(true)
  })

  it('passes through the cards array unchanged', () => {
    const cards = makeCards(3)
    expect(deriveHandState(cards).cards).toBe(cards)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/lib/handState.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/handState.js`**

```javascript
/**
 * Derives hand state from an array of held action card rows.
 * @param {Array} cards - held rows from game_action_card_deck
 * @returns {{ cards: Array, overLimit: boolean, mustDiscard: boolean }}
 */
export function deriveHandState(cards) {
  const overLimit = cards.length > 7
  return { cards, overLimit, mustDiscard: overLimit }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/handState.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/handState.js tests/lib/handState.test.js
git commit -m "feat: add deriveHandState pure function"
```

---

## Task 7: Create ActionCardModal + tests (TDD)

**Files:**
- Create: `ti4-companion-web/src/components/game/ActionCardModal.jsx`
- Create: `ti4-companion-web/tests/components/game/ActionCardModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/game/ActionCardModal.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ActionCardModal from '../../../src/components/game/ActionCardModal.jsx'

const CARDS = [
  {
    id: 'deck-1',
    action_cards: { name: 'Hack Election', timing: 'Action', text: 'Change the outcome of this vote.' },
  },
  {
    id: 'deck-2',
    action_cards: { name: 'Spy', timing: 'Action', text: "Look at a player's hand and steal a card." },
  },
]

function renderModal(props = {}) {
  return render(
    <ActionCardModal
      cards={CARDS}
      onDraw={vi.fn()}
      onDiscard={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />
  )
}

describe('ActionCardModal', () => {
  it('renders card names and timing tags', () => {
    renderModal()
    expect(screen.getByText('Hack Election')).toBeInTheDocument()
    expect(screen.getByText('Spy')).toBeInTheDocument()
    expect(screen.getAllByText('Action')).toHaveLength(2)
  })

  it('renders card text', () => {
    renderModal()
    expect(screen.getByText('Change the outcome of this vote.')).toBeInTheDocument()
  })

  it('shows Draw button when hand has 7 or fewer cards', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /draw card/i })).toBeInTheDocument()
  })

  it('hides Draw button and shows discard-required banner when hand exceeds 7', () => {
    const overLimitCards = Array.from({ length: 8 }, (_, i) => ({
      id: `deck-${i}`,
      action_cards: { name: `Card ${i}`, timing: 'Action', text: 'Text.' },
    }))
    renderModal({ cards: overLimitCards })
    expect(screen.queryByRole('button', { name: /draw card/i })).not.toBeInTheDocument()
    expect(screen.getByText(/discard down to 7/i)).toBeInTheDocument()
  })

  it('calls onDraw when Draw button is clicked', () => {
    const onDraw = vi.fn()
    renderModal({ onDraw })
    fireEvent.click(screen.getByRole('button', { name: /draw card/i }))
    expect(onDraw).toHaveBeenCalledOnce()
  })

  it('calls onDiscard with card id when Play / Discard is clicked', () => {
    const onDiscard = vi.fn()
    renderModal({ onDiscard })
    const discardButtons = screen.getAllByRole('button', { name: /play \/ discard/i })
    fireEvent.click(discardButtons[0])
    expect(onDiscard).toHaveBeenCalledWith('deck-1')
  })

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows empty state message when hand is empty', () => {
    renderModal({ cards: [] })
    expect(screen.getByText(/your hand is empty/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/components/game/ActionCardModal.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/game/ActionCardModal.jsx`**

```jsx
import { deriveHandState } from '../../lib/handState.js'

const TIMING_COLOURS = {
  Action: 'text-plasma',
  Agenda: 'text-gold',
  Component: 'text-success',
}

export default function ActionCardModal({ cards, onDraw, onDiscard, onClose }) {
  const { mustDiscard } = deriveHandState(cards)

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-lg flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="label">ACTION CARDS ({cards.length}/7)</p>
          <button className="btn-ghost text-xs" onClick={onClose}>CLOSE</button>
        </div>

        {mustDiscard && (
          <div className="bg-danger/20 border border-danger rounded px-3 py-2 text-danger text-xs font-body">
            Hand limit exceeded — discard down to 7 before continuing.
          </div>
        )}

        {!mustDiscard && (
          <button className="btn-primary text-xs self-start" onClick={onDraw}>
            DRAW CARD
          </button>
        )}

        {cards.length === 0 && (
          <p className="text-dim text-sm font-body">Your hand is empty.</p>
        )}

        <div className="flex flex-col gap-3">
          {cards.map(card => (
            <div key={card.id} className="panel-inset flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="font-body text-bright text-sm">{card.action_cards.name}</span>
                <span className={`label text-xs ${TIMING_COLOURS[card.action_cards.timing] ?? 'text-muted'}`}>
                  {card.action_cards.timing}
                </span>
              </div>
              <p className="text-dim text-xs font-body">{card.action_cards.text}</p>
              <button
                className="btn-ghost text-xs self-end mt-1"
                onClick={() => onDiscard(card.id)}
              >
                PLAY / DISCARD
              </button>
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
npx vitest run tests/components/game/ActionCardModal.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/ActionCardModal.jsx tests/components/game/ActionCardModal.test.jsx
git commit -m "feat: add ActionCardModal component"
```

---

## Task 8: Update MyPanelSection + tests

**Files:**
- Modify: `ti4-companion-web/src/components/game/MyPanelSection.jsx`
- Modify: `ti4-companion-web/tests/components/game/MyPanelSection.test.jsx`

- [ ] **Step 1: Write the failing test**

In `tests/components/game/MyPanelSection.test.jsx`:

Update the `PLAYER` constant to add `action_card_count: 4`:

```javascript
const PLAYER = {
  id: 'p1', display_name: 'Alice', faction: 'Arborec', colour: 'green',
  strategy_card: null, passed: false, vp: 5,
  command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 },
  commodities: 3, trade_goods: 1,
  technologies: ['Neural Motivator', 'Sarween Tools'],
  leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' },
  action_card_count: 4,
}
```

Update `renderPanel` to accept and pass `onOpenActionCards`:

```javascript
function renderPanel(overrides = {}) {
  return render(
    <MyPanelSection
      player={PLAYER}
      planets={PLANETS}
      isActive={false}
      game={{ phase: 'action' }}
      onPass={vi.fn()}
      onEndTurn={vi.fn()}
      onUpdateTokens={vi.fn()}
      onExhaustPlanet={vi.fn()}
      onReadyPlanet={vi.fn()}
      onPickStrategyCard={vi.fn()}
      onUpdateCommodities={vi.fn()}
      onUpdateTradeGoods={vi.fn()}
      onCycleLeader={vi.fn()}
      onOpenActionCards={vi.fn()}
      {...overrides}
    />
  )
}
```

Add this test inside the `describe` block:

```javascript
  it('shows Action Cards button with count and calls onOpenActionCards when clicked', () => {
    const onOpenActionCards = vi.fn()
    renderPanel({ onOpenActionCards })
    const btn = screen.getByRole('button', { name: /action cards \(4\)/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onOpenActionCards).toHaveBeenCalledOnce()
  })
```

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
npx vitest run tests/components/game/MyPanelSection.test.jsx
```

Expected: FAIL — button not found.

- [ ] **Step 3: Update `src/components/game/MyPanelSection.jsx`**

Add `onOpenActionCards` to the destructured props:

```jsx
export default function MyPanelSection({
  player, planets, isActive, game,
  onPass, onEndTurn, onUpdateTokens,
  onExhaustPlanet, onReadyPlanet,
  onPickStrategyCard, onUpdateCommodities, onUpdateTradeGoods, onCycleLeader,
  onOpenActionCards,
}) {
```

Add this block at the bottom of the returned JSX, after the Technologies section and before the closing `</div>`:

```jsx
      {/* Action Cards */}
      <button className="btn-ghost text-xs self-start" onClick={onOpenActionCards}>
        ACTION CARDS ({player.action_card_count ?? 0})
      </button>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/MyPanelSection.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/MyPanelSection.jsx tests/components/game/MyPanelSection.test.jsx
git commit -m "feat: add Action Cards button to MyPanelSection"
```

---

## Task 9: Update ScoreboardSection + tests

**Files:**
- Modify: `ti4-companion-web/src/components/game/ScoreboardSection.jsx`
- Modify: `ti4-companion-web/tests/components/game/ScoreboardSection.test.jsx`

- [ ] **Step 1: Write the failing test**

In `tests/components/game/ScoreboardSection.test.jsx`, update `PLAYERS` to include `action_card_count`:

```javascript
const PLAYERS = [
  { id: 'p1', display_name: 'Alice', faction: 'Arborec', colour: 'green',  strategy_card: 1, passed: false, vp: 8, action_card_count: 3 },
  { id: 'p2', display_name: 'Bob',   faction: 'Letnev',  colour: 'red',    strategy_card: 3, passed: true,  vp: 5, action_card_count: 0 },
  { id: 'p3', display_name: 'Carol', faction: 'Saar',    colour: 'yellow', strategy_card: 5, passed: false, vp: 3, action_card_count: 7 },
]
```

Add this test inside the `describe` block:

```javascript
  it('shows action card count badge for each player', () => {
    renderScoreboard()
    expect(screen.getByLabelText('Alice action cards: 3')).toBeInTheDocument()
    expect(screen.getByLabelText('Bob action cards: 0')).toBeInTheDocument()
    expect(screen.getByLabelText('Carol action cards: 7')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
npx vitest run tests/components/game/ScoreboardSection.test.jsx
```

Expected: FAIL — aria-label elements not found.

- [ ] **Step 3: Update `src/components/game/ScoreboardSection.jsx`**

Inside the player row `<div>`, add a card count badge after the strategy card badge and before the VP display:

```jsx
              <span
                className="label text-xs text-muted"
                aria-label={`${player.display_name} action cards: ${player.action_card_count ?? 0}`}
              >
                ✦ {player.action_card_count ?? 0}
              </span>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/ScoreboardSection.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/ScoreboardSection.jsx tests/components/game/ScoreboardSection.test.jsx
git commit -m "feat: add action card count badge to ScoreboardSection"
```

---

## Task 10: Update useGame + integration tests

**Files:**
- Modify: `ti4-companion-web/src/hooks/useGame.js`
- Create: `ti4-companion-web/tests/hooks/useGame.phase4b.test.js`

- [ ] **Step 1: Write the failing integration tests**

Create `tests/hooks/useGame.phase4b.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/game/ABC123' }),
}))

const { mockChannel } = vi.hoisted(() => {
  const mockChannel = { on: vi.fn(), subscribe: vi.fn() }
  return { mockChannel }
})

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  updateGameSettings: vi.fn(),
  pickFactionColor: vi.fn(),
  setSpeaker: vi.fn(),
  startGame: vi.fn(),
  endTurn: vi.fn(),
  passAction: vi.fn(),
  advancePhase: vi.fn(),
  scoreObjective: vi.fn(),
  revealObjective: vi.fn(),
  shuffleDeck: vi.fn(),
  updateCommandTokens: vi.fn(),
  drawActionCard: vi.fn(),
  discardActionCard: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { drawActionCard, discardActionCard } from '../../src/lib/edgeFunctions.js'
import { useGame } from '../../src/hooks/useGame.js'

const GAME = {
  id: 'game-uuid', code: 'ABC123', host_user_id: 'host-uuid',
  status: 'active', phase: 'action', round: 1, vp_goal: 10,
  speaker_player_id: 'p1', active_player_id: 'p1',
}
const PLAYERS = [
  { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', strategy_card: 1, passed: false, vp: 5, action_card_count: 2 },
  { id: 'p2', user_id: 'other-uuid', display_name: 'Bob',   strategy_card: 3, passed: false, vp: 3, action_card_count: 0 },
]
const MY_CARDS = [
  { id: 'deck-1', state: 'held', held_by_player_id: 'p1', action_cards: { name: 'Hack Election', timing: 'Action', text: 'Change the vote.' } },
  { id: 'deck-2', state: 'held', held_by_player_id: 'p1', action_cards: { name: 'Spy', timing: 'Action', text: 'Steal a card.' } },
]

function mockSupabase({ myCards = MY_CARDS } = {}) {
  supabase.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: GAME, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: PLAYERS, error: null }),
        }),
      }
    }
    if (table === 'game_public_objectives') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_action_card_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: myCards, error: null }),
          }),
        }),
      }
    }
  })
}

describe('useGame Phase 4b — action cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannel.on.mockReturnValue(mockChannel)
    mockSupabase()
  })

  it('loads myCards for the current player on mount', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myCards).toHaveLength(2)
    expect(result.current.myCards[0].id).toBe('deck-1')
  })

  it('drawTheActionCard calls drawActionCard with the game id', async () => {
    drawActionCard.mockResolvedValue({ drawn: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.drawTheActionCard())
    expect(drawActionCard).toHaveBeenCalledWith('game-uuid')
  })

  it('discardTheActionCard calls discardActionCard with game id and card id', async () => {
    discardActionCard.mockResolvedValue({ discarded: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.discardTheActionCard('deck-1'))
    expect(discardActionCard).toHaveBeenCalledWith('game-uuid', 'deck-1')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/hooks/useGame.phase4b.test.js
```

Expected: FAIL — `myCards` is undefined, wrappers are not present.

- [ ] **Step 3: Replace `src/hooks/useGame.js`**

```javascript
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import {
  updateGameSettings, pickFactionColor, setSpeaker, startGame,
  endTurn, passAction, advancePhase, scoreObjective,
  revealObjective, shuffleDeck, updateCommandTokens,
  drawActionCard, discardActionCard,
} from '../lib/edgeFunctions.js'

export function useGame(code, userId) {
  const navigate = useNavigate()
  const location = useLocation()
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [objectives, setObjectives] = useState([])
  const [planets, setPlanets] = useState([])
  const [myCards, setMyCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const isGameScreen = location.pathname.startsWith('/game/')

  useEffect(() => {
    if (!code || !userId) return

    let channel = null
    let mounted = true

    async function load() {
      setLoading(true)
      setError(null)

      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', code.toUpperCase())
        .maybeSingle()

      if (!mounted) return
      if (gameError) { setError('Failed to load game'); setLoading(false); return }
      if (!gameData) { setError('Game not found'); setLoading(false); return }

      const { data: playersData, error: playersError } = await supabase
        .from('game_players')
        .select('*')
        .eq('game_id', gameData.id)

      if (!mounted) return
      if (playersError) { setError('Failed to load players'); setLoading(false); return }

      const isInGame = (playersData ?? []).some(p => p.user_id === userId)
      if (!isInGame) {
        navigate('/setup', { replace: true })
        return
      }

      if (gameData.status === 'active' && !isGameScreen) {
        navigate(`/game/${code}`, { replace: true })
        return
      }

      let objectivesData = []
      let planetsData = []
      let myCardsData = []
      let myPlayer = null

      if (isGameScreen) {
        const { data: objs } = await supabase
          .from('game_public_objectives')
          .select('*, public_objectives(name, stage, points, condition)')
          .eq('game_id', gameData.id)
        if (!mounted) return
        objectivesData = objs ?? []

        const { data: pls } = await supabase
          .from('game_player_planets')
          .select('*')
          .eq('game_id', gameData.id)
        if (!mounted) return
        planetsData = pls ?? []

        myPlayer = (playersData ?? []).find(p => p.user_id === userId) ?? null
        if (myPlayer) {
          const { data: cards } = await supabase
            .from('game_action_card_deck')
            .select('*, action_cards(name, timing, text)')
            .eq('game_id', gameData.id)
            .eq('held_by_player_id', myPlayer.id)
          if (!mounted) return
          myCardsData = cards ?? []
        }
      }

      setGame(gameData)
      setPlayers(playersData ?? [])
      setObjectives(objectivesData)
      setPlanets(planetsData)
      setMyCards(myCardsData)
      setLoading(false)

      channel = supabase
        .channel(`session:${gameData.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` },
          (payload) => {
            if (!mounted) return
            setGame(prev => ({ ...prev, ...payload.new }))
            if (payload.new.status === 'active' && !isGameScreen) {
              navigate(`/game/${code}`, { replace: true })
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameData.id}` },
          (payload) => {
            if (!mounted) return
            setPlayers(prev => {
              if (payload.eventType === 'INSERT') return [...prev, payload.new]
              if (payload.eventType === 'UPDATE') return prev.map(p => p.id === payload.new.id ? payload.new : p)
              return prev
            })
          }
        )

      if (isGameScreen) {
        channel
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'game_public_objectives', filter: `game_id=eq.${gameData.id}` },
            async () => {
              if (!mounted) return
              const { data } = await supabase
                .from('game_public_objectives')
                .select('*, public_objectives(name, stage, points, condition)')
                .eq('game_id', gameData.id)
              if (mounted && data) setObjectives(data)
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'game_player_planets', filter: `game_id=eq.${gameData.id}` },
            (payload) => {
              if (!mounted) return
              setPlanets(prev => {
                if (payload.eventType === 'INSERT') return [...prev, payload.new]
                if (payload.eventType === 'UPDATE') return prev.map(p => p.id === payload.new.id ? payload.new : p)
                if (payload.eventType === 'DELETE') return prev.filter(p => p.id !== payload.old.id)
                return prev
              })
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'game_action_card_deck', filter: `game_id=eq.${gameData.id}` },
            async () => {
              if (!mounted || !myPlayer) return
              const { data } = await supabase
                .from('game_action_card_deck')
                .select('*, action_cards(name, timing, text)')
                .eq('game_id', gameData.id)
                .eq('held_by_player_id', myPlayer.id)
              if (mounted && data) setMyCards(data)
            }
          )
      }

      channel.subscribe()
    }

    load()

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, userId])

  const currentPlayer = players.find(p => p.user_id === userId) ?? null
  const isHost = game?.host_user_id === userId

  async function exhaustPlanet(planetName) {
    if (!currentPlayer) return
    await supabase
      .from('game_player_planets')
      .update({ exhausted: true })
      .eq('game_id', game.id)
      .eq('player_id', currentPlayer.id)
      .eq('planet_name', planetName)
  }

  async function readyPlanet(planetName) {
    if (!currentPlayer) return
    await supabase
      .from('game_player_planets')
      .update({ exhausted: false })
      .eq('game_id', game.id)
      .eq('player_id', currentPlayer.id)
      .eq('planet_name', planetName)
  }

  async function pickStrategyCard(card) {
    if (!currentPlayer) return
    await supabase
      .from('game_players')
      .update({ strategy_card: card })
      .eq('id', currentPlayer.id)
  }

  async function updateCommodities(n) {
    if (!currentPlayer) return
    await supabase
      .from('game_players')
      .update({ commodities: n })
      .eq('id', currentPlayer.id)
  }

  async function updateTradeGoods(n) {
    if (!currentPlayer) return
    await supabase
      .from('game_players')
      .update({ trade_goods: n })
      .eq('id', currentPlayer.id)
  }

  async function cycleLeader(leaderType, newStatus) {
    if (!currentPlayer) return
    await supabase
      .from('game_players')
      .update({ leaders: { ...currentPlayer.leaders, [leaderType]: newStatus } })
      .eq('id', currentPlayer.id)
  }

  return {
    game,
    players,
    objectives,
    planets,
    myCards,
    currentPlayer,
    isHost,
    loading,
    error,
    // Phase 2 wrappers (lobby)
    updateSettings: (settings) => game ? updateGameSettings(game.id, settings) : Promise.reject(new Error('Game not loaded')),
    pickFaction: (faction, colour) => game ? pickFactionColor(game.id, faction, colour) : Promise.reject(new Error('Game not loaded')),
    setGameSpeaker: (playerId) => game ? setSpeaker(game.id, playerId) : Promise.reject(new Error('Game not loaded')),
    startTheGame: () => game ? startGame(game.id) : Promise.reject(new Error('Game not loaded')),
    // Phase 3 wrappers (in-game)
    endTheTurn: () => game ? endTurn(game.id) : Promise.reject(new Error('Game not loaded')),
    passTheAction: () => game ? passAction(game.id) : Promise.reject(new Error('Game not loaded')),
    advanceThePhase: () => game ? advancePhase(game.id) : Promise.reject(new Error('Game not loaded')),
    scoreAnObjective: (objectiveId, playerId) => game ? scoreObjective(game.id, objectiveId, playerId) : Promise.reject(new Error('Game not loaded')),
    revealAnObjective: (stage) => game ? revealObjective(game.id, stage) : Promise.reject(new Error('Game not loaded')),
    shuffleTheDeck: (deckType) => game ? shuffleDeck(game.id, deckType) : Promise.reject(new Error('Game not loaded')),
    updateTokens: (tokens) => game ? updateCommandTokens(game.id, tokens) : Promise.reject(new Error('Game not loaded')),
    exhaustPlanet,
    readyPlanet,
    pickStrategyCard,
    updateCommodities,
    updateTradeGoods,
    cycleLeader,
    // Phase 4b wrappers (action cards)
    drawTheActionCard: () => game ? drawActionCard(game.id) : Promise.reject(new Error('Game not loaded')),
    discardTheActionCard: (cardId) => game ? discardActionCard(game.id, cardId) : Promise.reject(new Error('Game not loaded')),
  }
}
```

- [ ] **Step 4: Run phase 4b tests to confirm they pass**

```bash
npx vitest run tests/hooks/useGame.phase4b.test.js
```

Expected: PASS.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useGame.js tests/hooks/useGame.phase4b.test.js
git commit -m "feat: add myCards state and action card wrappers to useGame"
```

---

## Task 11: Wire up ActionCardModal in GameScreen

**Files:**
- Modify: `ti4-companion-web/src/components/game/GameScreen.jsx`

- [ ] **Step 1: Replace `src/components/game/GameScreen.jsx`**

```jsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGame } from '../../hooks/useGame.js'
import { deriveActivePlayer, deriveSpeaker } from '../../lib/gameUtils.js'
import GameHeader from './GameHeader.jsx'
import ScoreboardSection from './ScoreboardSection.jsx'
import MyPanelSection from './MyPanelSection.jsx'
import ObjectivesSection from './ObjectivesSection.jsx'
import HostControlsSection from './HostControlsSection.jsx'
import ActionCardModal from './ActionCardModal.jsx'

export default function GameScreen({ userId }) {
  const { code } = useParams()
  const {
    game, players, objectives, planets, myCards, currentPlayer, isHost, loading, error,
    endTheTurn, passTheAction, advanceThePhase,
    scoreAnObjective, revealAnObjective, shuffleTheDeck,
    updateTokens, exhaustPlanet, readyPlanet,
    pickStrategyCard, updateCommodities, updateTradeGoods, cycleLeader,
    drawTheActionCard, discardTheActionCard,
  } = useGame(code, userId)

  const [actionCardModalOpen, setActionCardModalOpen] = useState(false)

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

  return (
    <div className="min-h-screen bg-void">
      <GameHeader game={game} speaker={speaker} />
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        <ScoreboardSection
          players={players}
          game={game}
          currentPlayerId={currentPlayer?.id}
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
          onOpenActionCards={() => setActionCardModalOpen(true)}
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

      {actionCardModalOpen && (
        <ActionCardModal
          cards={myCards}
          onDraw={drawTheActionCard}
          onDiscard={discardTheActionCard}
          onClose={() => setActionCardModalOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/game/GameScreen.jsx
git commit -m "feat: wire up ActionCardModal in GameScreen"
```

---

## Task 12: Smoke test

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify the golden path**

1. Start a new game — open Supabase table editor and confirm `game_action_card_deck` has rows with `state = 'deck'` and `deck_position` values assigned
2. Open the Action Cards modal from My Panel — confirm it opens, shows "Your hand is empty", Draw button is present
3. Click Draw — confirm a card appears with name, timing tag, and card text; confirm scoreboard `action_card_count` increments for your player
4. Keep drawing until hand has 8 cards — confirm the discard-required banner appears and Draw button disappears
5. Click Play / Discard on one card — confirm it disappears from the modal, count decrements on scoreboard, Draw button reappears
6. Open a second browser session as another player — confirm their modal shows their own hand (empty or their own cards); confirm your card count is visible on their scoreboard
