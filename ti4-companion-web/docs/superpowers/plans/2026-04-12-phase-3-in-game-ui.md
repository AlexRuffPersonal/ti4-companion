# Phase 3 — In-Game UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `GamePlaceholder` with a functional in-game screen covering Strategy, Action, and Status phases with active-player tracking, public objective reveal/scoring, command token redistribution, and a generic deck shuffle.

**Architecture:** `GameScreen` owns `useGame` (extended to load `game_public_objectives` and `game_player_planets`). Six new Edge Functions manage phase advancement, passing, and objectives. `active_player_id` is stored on `games` and managed server-side. Migration 007 adds two columns. `game-start` is updated to initialise objective decks.

**Tech Stack:** React 19, Tailwind CSS 3, Supabase JS v2, Deno/TypeScript (Edge Functions), Vitest 4, @testing-library/react

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `supabase/migrations/007_phase3.sql` | Add `active_player_id` to `games`; add `deck_position` + `state` to `game_public_objectives` |
| Create | `supabase/functions/game-end-turn/index.ts` | Advance `active_player_id` to next non-passed player in initiative order |
| Create | `supabase/functions/game-player-pass/index.ts` | Mark caller as passed; advance `active_player_id` |
| Create | `supabase/functions/game-advance-phase/index.ts` | strategy→action→status→strategy transitions with all resets |
| Create | `supabase/functions/game-score-objective/index.ts` | Append player to `scored_by`; increment VP |
| Create | `supabase/functions/game-reveal-objective/index.ts` | Flip lowest-`deck_position` deck card to revealed |
| Create | `supabase/functions/game-shuffle-deck/index.ts` | Randomly reassign `deck_position` for any deck type |
| Create | `supabase/functions/game-update-command-tokens/index.ts` | Validate ≤16; update `command_tokens` on caller's player row |
| Modify | `supabase/functions/game-start/index.ts` | Insert all expansion-filtered objectives into `game_public_objectives` with shuffled positions |
| Create | `ti4-companion-web/src/lib/gameUtils.js` | Pure functions: `deriveActivePlayer`, `deriveSpeaker`, `phaseLabel` |
| Modify | `ti4-companion-web/src/lib/edgeFunctions.js` | Add typed wrappers for 6 new Edge Functions |
| Modify | `ti4-companion-web/src/hooks/useGame.js` | Load objectives + planets; add `useLocation` redirect fix; expose new action wrappers |
| Create | `ti4-companion-web/src/components/game/GameScreen.jsx` | Owns `useGame`; renders all sections |
| Create | `ti4-companion-web/src/components/game/GameHeader.jsx` | Round · Phase · VP goal · Speaker |
| Create | `ti4-companion-web/src/components/game/ScoreboardSection.jsx` | Player rows with active/passed/waiting badges and VP |
| Create | `ti4-companion-web/src/components/game/MyPanelSection.jsx` | Current player's tokens, planets, Pass/End Turn buttons |
| Create | `ti4-companion-web/src/components/game/ObjectivesSection.jsx` | Revealed objectives with scorer names |
| Create | `ti4-companion-web/src/components/game/HostControlsSection.jsx` | Score/Reveal/Shuffle/Advance buttons |
| Modify | `ti4-companion-web/src/App.jsx` | Replace `GamePlaceholder` with `GameScreen`; pass `userId` |
| Delete | `ti4-companion-web/src/components/game/GamePlaceholder.jsx` | Replaced by `GameScreen` |
| Create | `ti4-companion-web/tests/lib/gameUtils.test.js` | Unit tests for pure utility functions |
| Create | `ti4-companion-web/tests/lib/edgeFunctions.phase3.test.js` | Wrapper call tests for 6 new functions |
| Modify | `ti4-companion-web/tests/hooks/useGame.test.js` | Add `useLocation` to react-router-dom mock |
| Create | `ti4-companion-web/tests/hooks/useGame.phase3.test.js` | Integration tests: game-screen load path, new wrappers |
| Create | `ti4-companion-web/tests/components/game/ScoreboardSection.test.jsx` | Rendering tests |
| Create | `ti4-companion-web/tests/components/game/MyPanelSection.test.jsx` | Rendering tests |
| Create | `ti4-companion-web/tests/components/game/ObjectivesSection.test.jsx` | Rendering tests |
| Create | `ti4-companion-web/tests/components/game/HostControlsSection.test.jsx` | Rendering tests |

---

## Task 1: Migration 007

**Files:**
- Create: `supabase/migrations/007_phase3.sql`

No tests — SQL migration.

- [ ] **Step 1: Create the migration file**

`supabase/migrations/007_phase3.sql`:

```sql
-- Track the active player during the action phase.
-- Set by game-end-turn and game-player-pass; cleared by game-advance-phase.
-- null = no active player (strategy/status phase, or action phase complete).
ALTER TABLE public.games
  ADD COLUMN active_player_id UUID REFERENCES public.game_players(id);

-- Support deck ordering for public objectives so game-shuffle-deck and
-- game-reveal-objective work the same way as other deck tables.
-- game-start populates these rows when a game begins.
ALTER TABLE public.game_public_objectives
  ADD COLUMN deck_position INTEGER,
  ADD COLUMN state TEXT NOT NULL DEFAULT 'deck';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/007_phase3.sql
git commit -m "feat: add migration 007 — active_player_id on games, deck columns on game_public_objectives"
```

---

## Task 2: `game-end-turn` Edge Function

**Files:**
- Create: `supabase/functions/game-end-turn/index.ts`

No unit tests (Edge Functions are smoke-tested manually after deploy).

- [ ] **Step 1: Create the function**

`supabase/functions/game-end-turn/index.ts`:

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
    .select('id, phase, active_player_id')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.phase !== 'action') return errorResponse('Not in action phase', 409)
  if (!game.active_player_id) return errorResponse('No active player', 409)

  const { data: callerPlayer, error: callerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (callerError) return errorResponse('Database error', 500)
  if (!callerPlayer) return errorResponse('Player not found in this game', 404)
  if (callerPlayer.id !== game.active_player_id) return errorResponse('Not your turn', 403)

  const { data: players, error: playersError } = await db
    .from('game_players')
    .select('id, strategy_card, passed')
    .eq('game_id', body.game_id)
    .order('strategy_card', { ascending: true, nullsFirst: false })
  if (playersError) return errorResponse('Database error', 500)

  // Advance to next non-passed player in initiative cycle (wraps around)
  const nonPassed = (players ?? []).filter(p => !p.passed)
  let nextPlayerId: string | null = null
  if (nonPassed.length > 0) {
    const currentIndex = nonPassed.findIndex(p => p.id === callerPlayer.id)
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % nonPassed.length
    nextPlayerId = nonPassed[nextIndex].id
  }

  const { error: updateError } = await db
    .from('games')
    .update({ active_player_id: nextPlayerId })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ advanced: true })
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/game-end-turn/index.ts
git commit -m "feat: add game-end-turn Edge Function"
```

---

## Task 3: `game-player-pass` Edge Function

**Files:**
- Create: `supabase/functions/game-player-pass/index.ts`

- [ ] **Step 1: Create the function**

`supabase/functions/game-player-pass/index.ts`:

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
    .select('id, phase, active_player_id')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.phase !== 'action') return errorResponse('Not in action phase', 409)
  if (!game.active_player_id) return errorResponse('No active player', 409)

  const { data: callerPlayer, error: callerError } = await db
    .from('game_players')
    .select('id, strategy_card')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (callerError) return errorResponse('Database error', 500)
  if (!callerPlayer) return errorResponse('Player not found in this game', 404)
  if (callerPlayer.id !== game.active_player_id) return errorResponse('Not your turn', 403)

  // Mark as passed
  const { error: passError } = await db
    .from('game_players')
    .update({ passed: true })
    .eq('id', callerPlayer.id)
  if (passError) return errorResponse(`Update failed: ${passError.message}`, 500)

  // Fetch updated player list (caller now has passed=true in DB)
  const { data: players, error: playersError } = await db
    .from('game_players')
    .select('id, strategy_card, passed')
    .eq('game_id', body.game_id)
    .order('strategy_card', { ascending: true, nullsFirst: false })
  if (playersError) return errorResponse('Database error', 500)

  // Find next non-passed player in initiative order after the one who just passed
  const nonPassed = (players ?? []).filter(p => !p.passed)
  let nextPlayerId: string | null = null
  if (nonPassed.length > 0) {
    const afterCurrent = nonPassed.find(
      p => (p.strategy_card ?? 99) > (callerPlayer.strategy_card ?? 0)
    )
    nextPlayerId = (afterCurrent ?? nonPassed[0]).id
  }

  const { error: updateError } = await db
    .from('games')
    .update({ active_player_id: nextPlayerId })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ passed: true })
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/game-player-pass/index.ts
git commit -m "feat: add game-player-pass Edge Function"
```

---

## Task 4: `game-advance-phase` Edge Function

**Files:**
- Create: `supabase/functions/game-advance-phase/index.ts`

- [ ] **Step 1: Create the function**

`supabase/functions/game-advance-phase/index.ts`:

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
    .select('id, host_user_id, phase, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can advance the phase', 403)
  if (!['strategy', 'action', 'status'].includes(game.phase)) {
    return errorResponse(`Cannot advance from phase: ${game.phase}`, 409)
  }

  if (game.phase === 'strategy') {
    // Strategy → Action: set active player to lowest strategy_card
    const { data: players, error: playersError } = await db
      .from('game_players')
      .select('id, strategy_card')
      .eq('game_id', body.game_id)
      .not('strategy_card', 'is', null)
      .order('strategy_card', { ascending: true })
      .limit(1)
    if (playersError) return errorResponse('Database error', 500)
    const firstPlayer = players?.[0] ?? null

    const { error } = await db
      .from('games')
      .update({ phase: 'action', active_player_id: firstPlayer?.id ?? null })
      .eq('id', body.game_id)
    if (error) return errorResponse(`Update failed: ${error.message}`, 500)

  } else if (game.phase === 'action') {
    // Action → Status: clear active player, ready all planets
    const { error: planetsError } = await db
      .from('game_player_planets')
      .update({ exhausted: false })
      .eq('game_id', body.game_id)
    if (planetsError) return errorResponse(`Failed to ready planets: ${planetsError.message}`, 500)

    const { error } = await db
      .from('games')
      .update({ phase: 'status', active_player_id: null })
      .eq('id', body.game_id)
    if (error) return errorResponse(`Update failed: ${error.message}`, 500)

  } else {
    // Status → Strategy: new round — reset passed, strategy cards, increment round
    const { error: playersError } = await db
      .from('game_players')
      .update({ passed: false, strategy_card: null, strategy_card_2: null })
      .eq('game_id', body.game_id)
    if (playersError) return errorResponse(`Failed to reset players: ${playersError.message}`, 500)

    const { error } = await db
      .from('games')
      .update({ phase: 'strategy', round: game.round + 1, active_player_id: null })
      .eq('id', body.game_id)
    if (error) return errorResponse(`Update failed: ${error.message}`, 500)
  }

  return okResponse({ advanced: true })
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/game-advance-phase/index.ts
git commit -m "feat: add game-advance-phase Edge Function"
```

---

## Task 5: `game-score-objective` + `game-reveal-objective` Edge Functions

**Files:**
- Create: `supabase/functions/game-score-objective/index.ts`
- Create: `supabase/functions/game-reveal-objective/index.ts`

- [ ] **Step 1: Create `game-score-objective`**

`supabase/functions/game-score-objective/index.ts`:

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

  let body: { game_id?: unknown; objective_id?: unknown; player_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.objective_id || typeof body.objective_id !== 'string') return errorResponse("'objective_id' is required")
  if (!body.player_id || typeof body.player_id !== 'string') return errorResponse("'player_id' is required")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can score objectives', 403)

  // objective_id is the game_public_objectives row id
  const { data: gameObj, error: objError } = await db
    .from('game_public_objectives')
    .select('id, objective_id, state, scored_by')
    .eq('id', body.objective_id)
    .eq('game_id', body.game_id)
    .maybeSingle()
  if (objError) return errorResponse('Database error', 500)
  if (!gameObj) return errorResponse('Objective not found in this game', 404)
  if (gameObj.state !== 'revealed') return errorResponse('Objective has not been revealed yet', 409)
  if ((gameObj.scored_by ?? []).includes(body.player_id)) {
    return errorResponse('Player has already scored this objective', 409)
  }

  // Get point value from reference table
  const { data: refObj, error: refError } = await db
    .from('public_objectives')
    .select('points')
    .eq('id', gameObj.objective_id)
    .single()
  if (refError) return errorResponse('Database error', 500)
  const points = refObj?.points ?? 1

  // Append player to scored_by
  const { error: updateObjError } = await db
    .from('game_public_objectives')
    .update({ scored_by: [...(gameObj.scored_by ?? []), body.player_id] })
    .eq('id', body.objective_id)
  if (updateObjError) return errorResponse(`Update failed: ${updateObjError.message}`, 500)

  // Increment VP
  const { data: player, error: playerFetchError } = await db
    .from('game_players')
    .select('vp')
    .eq('id', body.player_id)
    .eq('game_id', body.game_id)
    .maybeSingle()
  if (playerFetchError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { error: vpError } = await db
    .from('game_players')
    .update({ vp: player.vp + points })
    .eq('id', body.player_id)
  if (vpError) return errorResponse(`VP update failed: ${vpError.message}`, 500)

  return okResponse({ scored: true, vp_awarded: points })
})
```

- [ ] **Step 2: Create `game-reveal-objective`**

`supabase/functions/game-reveal-objective/index.ts`:

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

  let body: { game_id?: unknown; stage?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  const stage = Number(body.stage)
  if (!body.stage || ![1, 2].includes(stage)) return errorResponse("'stage' must be 1 or 2")

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id, round')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can reveal objectives', 403)

  // Get reference IDs for this stage
  const { data: stageObjs, error: stageError } = await db
    .from('public_objectives')
    .select('id')
    .eq('stage', stage)
  if (stageError) return errorResponse('Database error', 500)
  const stageIds = (stageObjs ?? []).map((o: { id: string }) => o.id)
  if (stageIds.length === 0) return errorResponse('No objectives found for this stage', 404)

  // Find the deck card with the lowest position
  const { data: deckCard, error: deckError } = await db
    .from('game_public_objectives')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('state', 'deck')
    .in('objective_id', stageIds)
    .order('deck_position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (deckError) return errorResponse('Database error', 500)
  if (!deckCard) return errorResponse('No more objectives to reveal for this stage', 409)

  const { error: updateError } = await db
    .from('game_public_objectives')
    .update({ state: 'revealed', revealed_at_round: game.round })
    .eq('id', deckCard.id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ revealed: true })
})
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/game-score-objective/index.ts supabase/functions/game-reveal-objective/index.ts
git commit -m "feat: add game-score-objective and game-reveal-objective Edge Functions"
```

---

## Task 6: `game-shuffle-deck` Edge Function

**Files:**
- Create: `supabase/functions/game-shuffle-deck/index.ts`

- [ ] **Step 1: Create the function**

`supabase/functions/game-shuffle-deck/index.ts`:

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

type DeckConfig = { table: string; extraFilters?: Record<string, string> }

const DECK_CONFIGS: Record<string, DeckConfig> = {
  action_cards:           { table: 'game_action_card_deck' },
  agenda:                 { table: 'game_agenda_deck' },
  relics:                 { table: 'game_relic_deck' },
  exploration_cultural:   { table: 'game_exploration_decks', extraFilters: { deck_type: 'cultural' } },
  exploration_industrial: { table: 'game_exploration_decks', extraFilters: { deck_type: 'industrial' } },
  exploration_hazardous:  { table: 'game_exploration_decks', extraFilters: { deck_type: 'hazardous' } },
  exploration_frontier:   { table: 'game_exploration_decks', extraFilters: { deck_type: 'frontier' } },
}

const VALID_DECK_TYPES = [
  'public_objectives_1', 'public_objectives_2', ...Object.keys(DECK_CONFIGS)
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; deck_type?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.deck_type || typeof body.deck_type !== 'string') return errorResponse("'deck_type' is required")
  if (!VALID_DECK_TYPES.includes(body.deck_type)) {
    return errorResponse(`Invalid deck_type. Valid values: ${VALID_DECK_TYPES.join(', ')}`)
  }

  const { data: game, error: gameError } = await db
    .from('games')
    .select('host_user_id')
    .eq('id', body.game_id)
    .maybeSingle()
  if (gameError) return errorResponse('Database error', 500)
  if (!game) return errorResponse('Game not found', 404)
  if (game.host_user_id !== userId) return errorResponse('Only the host can shuffle decks', 403)

  // Resolve rows to shuffle
  let rows: { id: string }[] = []
  let tableName: string

  if (body.deck_type === 'public_objectives_1' || body.deck_type === 'public_objectives_2') {
    tableName = 'game_public_objectives'
    const stage = body.deck_type === 'public_objectives_1' ? 1 : 2
    const { data: stageObjs } = await db.from('public_objectives').select('id').eq('stage', stage)
    const stageIds = (stageObjs ?? []).map((o: { id: string }) => o.id)
    const { data, error } = await db
      .from('game_public_objectives')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('state', 'deck')
      .in('objective_id', stageIds)
    if (error) return errorResponse('Database error', 500)
    rows = data ?? []
  } else {
    const config = DECK_CONFIGS[body.deck_type]
    tableName = config.table
    let query = db.from(tableName).select('id').eq('game_id', body.game_id).eq('state', 'deck')
    for (const [k, v] of Object.entries(config.extraFilters ?? {})) {
      query = query.eq(k, v)
    }
    const { data, error } = await query
    if (error) return errorResponse('Database error', 500)
    rows = data ?? []
  }

  if (rows.length === 0) return okResponse({ shuffled: 0 })

  // Fisher-Yates shuffle of positions
  const positions = rows.map((_, i) => i)
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[positions[i], positions[j]] = [positions[j], positions[i]]
  }

  for (let i = 0; i < rows.length; i++) {
    const { error } = await db
      .from(tableName)
      .update({ deck_position: positions[i] })
      .eq('id', rows[i].id)
    if (error) return errorResponse(`Shuffle failed: ${error.message}`, 500)
  }

  return okResponse({ shuffled: rows.length })
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/game-shuffle-deck/index.ts
git commit -m "feat: add game-shuffle-deck Edge Function"
```

---

## Task 7: `game-update-command-tokens` Edge Function

**Files:**
- Create: `supabase/functions/game-update-command-tokens/index.ts`

- [ ] **Step 1: Create the function**

`supabase/functions/game-update-command-tokens/index.ts`:

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

  let body: { game_id?: unknown; tactic_total?: unknown; fleet?: unknown; strategy?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")

  const tactic = Number(body.tactic_total)
  const fleet = Number(body.fleet)
  const strategy = Number(body.strategy)
  if (isNaN(tactic) || isNaN(fleet) || isNaN(strategy)) {
    return errorResponse("'tactic_total', 'fleet', and 'strategy' must be numbers")
  }
  if (tactic < 0 || fleet < 0 || strategy < 0) return errorResponse('Token counts cannot be negative')
  if (tactic + fleet + strategy > 16) return errorResponse('Total command tokens cannot exceed 16')

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { error: updateError } = await db
    .from('game_players')
    .update({ command_tokens: { tactic_total: tactic, fleet, strategy } })
    .eq('id', player.id)
  if (updateError) return errorResponse(`Update failed: ${updateError.message}`, 500)

  return okResponse({ updated: true })
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/game-update-command-tokens/index.ts
git commit -m "feat: add game-update-command-tokens Edge Function"
```

---

## Task 8: Update `game-start` — objective deck initialization

**Files:**
- Modify: `supabase/functions/game-start/index.ts`

- [ ] **Step 1: Add objective deck initialization**

In `supabase/functions/game-start/index.ts`, add the `expansions` field to the game select, and insert shuffled objectives before the status update. Replace the file with:

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
    // Fisher-Yates shuffle deck positions
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

  const { error: updateError } = await db
    .from('games')
    .update({ status: 'active' })
    .eq('id', body.game_id)
  if (updateError) return errorResponse(`Failed to start game: ${updateError.message}`, 500)

  return okResponse({ started: true })
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/game-start/index.ts
git commit -m "feat: initialize public objective decks in game-start"
```

---

## Task 9: `edgeFunctions.js` Phase 3 wrappers (TDD)

**Files:**
- Modify: `ti4-companion-web/src/lib/edgeFunctions.js`
- Create: `ti4-companion-web/tests/lib/edgeFunctions.phase3.test.js`

- [ ] **Step 1: Write failing tests**

`ti4-companion-web/tests/lib/edgeFunctions.phase3.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import {
  endTurn,
  passAction,
  advancePhase,
  scoreObjective,
  revealObjective,
  shuffleDeck,
  updateCommandTokens,
} from '../../src/lib/edgeFunctions.js'

describe('Phase 3 edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('endTurn calls game-end-turn with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { advanced: true }, error: null })
    await endTurn('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-end-turn', { body: { game_id: 'g1' } })
  })

  it('passAction calls game-player-pass with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { passed: true }, error: null })
    await passAction('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-player-pass', { body: { game_id: 'g1' } })
  })

  it('advancePhase calls game-advance-phase with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { advanced: true }, error: null })
    await advancePhase('g1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-advance-phase', { body: { game_id: 'g1' } })
  })

  it('scoreObjective calls game-score-objective with correct args', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { scored: true, vp_awarded: 1 }, error: null })
    await scoreObjective('g1', 'obj-uuid', 'player-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-score-objective', {
      body: { game_id: 'g1', objective_id: 'obj-uuid', player_id: 'player-uuid' },
    })
  })

  it('revealObjective calls game-reveal-objective with game_id and stage', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { revealed: true }, error: null })
    await revealObjective('g1', 1)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-reveal-objective', {
      body: { game_id: 'g1', stage: 1 },
    })
  })

  it('shuffleDeck calls game-shuffle-deck with game_id and deck_type', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { shuffled: 5 }, error: null })
    await shuffleDeck('g1', 'public_objectives_1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-shuffle-deck', {
      body: { game_id: 'g1', deck_type: 'public_objectives_1' },
    })
  })

  it('updateCommandTokens calls game-update-command-tokens with token counts', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { updated: true }, error: null })
    await updateCommandTokens('g1', { tactic_total: 3, fleet: 3, strategy: 2 })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-update-command-tokens', {
      body: { game_id: 'g1', tactic_total: 3, fleet: 3, strategy: 2 },
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/lib/edgeFunctions.phase3.test.js
```

Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Add wrappers to `edgeFunctions.js`**

Append to `ti4-companion-web/src/lib/edgeFunctions.js` (after the existing exports):

```js
export const endTurn = (gameId) =>
  callFunction('game-end-turn', { game_id: gameId })

export const passAction = (gameId) =>
  callFunction('game-player-pass', { game_id: gameId })

export const advancePhase = (gameId) =>
  callFunction('game-advance-phase', { game_id: gameId })

export const scoreObjective = (gameId, objectiveId, playerId) =>
  callFunction('game-score-objective', { game_id: gameId, objective_id: objectiveId, player_id: playerId })

export const revealObjective = (gameId, stage) =>
  callFunction('game-reveal-objective', { game_id: gameId, stage })

export const shuffleDeck = (gameId, deckType) =>
  callFunction('game-shuffle-deck', { game_id: gameId, deck_type: deckType })

export const updateCommandTokens = (gameId, tokens) =>
  callFunction('game-update-command-tokens', { game_id: gameId, ...tokens })
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/edgeFunctions.phase3.test.js
```

Expected: 7 passing.

- [ ] **Step 5: Run full suite to check for regressions**

```bash
npm test
```

Expected: all existing tests still passing + 7 new.

- [ ] **Step 6: Commit**

```bash
git add ti4-companion-web/src/lib/edgeFunctions.js ti4-companion-web/tests/lib/edgeFunctions.phase3.test.js
git commit -m "feat: add Phase 3 edge function wrappers with tests"
```

---

## Task 10: `gameUtils.js` pure functions (TDD)

**Files:**
- Create: `ti4-companion-web/src/lib/gameUtils.js`
- Create: `ti4-companion-web/tests/lib/gameUtils.test.js`

- [ ] **Step 1: Write failing tests**

`ti4-companion-web/tests/lib/gameUtils.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { deriveActivePlayer, deriveSpeaker, phaseLabel } from '../../src/lib/gameUtils.js'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice', strategy_card: 1, passed: false },
  { id: 'p2', display_name: 'Bob',   strategy_card: 3, passed: false },
  { id: 'p3', display_name: 'Carol', strategy_card: 5, passed: true  },
]

describe('deriveActivePlayer', () => {
  it('returns the player matching active_player_id', () => {
    const game = { active_player_id: 'p2' }
    expect(deriveActivePlayer(PLAYERS, game)?.id).toBe('p2')
  })

  it('returns null when active_player_id is null', () => {
    expect(deriveActivePlayer(PLAYERS, { active_player_id: null })).toBeNull()
  })

  it('returns null when active_player_id is not found in players', () => {
    expect(deriveActivePlayer(PLAYERS, { active_player_id: 'unknown' })).toBeNull()
  })

  it('returns null when game is null', () => {
    expect(deriveActivePlayer(PLAYERS, null)).toBeNull()
  })

  it('returns null when players is empty', () => {
    expect(deriveActivePlayer([], { active_player_id: 'p1' })).toBeNull()
  })
})

describe('deriveSpeaker', () => {
  it('returns the player matching speaker_player_id', () => {
    const game = { speaker_player_id: 'p1' }
    expect(deriveSpeaker(PLAYERS, game)?.display_name).toBe('Alice')
  })

  it('returns null when speaker_player_id is null', () => {
    expect(deriveSpeaker(PLAYERS, { speaker_player_id: null })).toBeNull()
  })

  it('returns null when game is null', () => {
    expect(deriveSpeaker(PLAYERS, null)).toBeNull()
  })
})

describe('phaseLabel', () => {
  it('returns STRATEGY PHASE for strategy', () => {
    expect(phaseLabel('strategy')).toBe('STRATEGY PHASE')
  })

  it('returns ACTION PHASE for action', () => {
    expect(phaseLabel('action')).toBe('ACTION PHASE')
  })

  it('returns STATUS PHASE for status', () => {
    expect(phaseLabel('status')).toBe('STATUS PHASE')
  })

  it('uppercases unknown phases', () => {
    expect(phaseLabel('agenda')).toBe('AGENDA')
  })

  it('handles null gracefully', () => {
    expect(phaseLabel(null)).toBe('UNKNOWN')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/gameUtils.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `gameUtils.js`**

`ti4-companion-web/src/lib/gameUtils.js`:

```js
/**
 * Returns the player object whose turn it is, or null.
 * active_player_id is managed server-side by game-end-turn and game-player-pass.
 */
export function deriveActivePlayer(players, game) {
  if (!game?.active_player_id) return null
  return players.find(p => p.id === game.active_player_id) ?? null
}

/**
 * Returns the player object who is the current speaker, or null.
 */
export function deriveSpeaker(players, game) {
  if (!game?.speaker_player_id) return null
  return players.find(p => p.id === game.speaker_player_id) ?? null
}

/**
 * Returns a human-readable phase label for display in the game header.
 */
export function phaseLabel(phase) {
  const labels = {
    strategy: 'STRATEGY PHASE',
    action:   'ACTION PHASE',
    status:   'STATUS PHASE',
  }
  return labels[phase] ?? (phase?.toUpperCase() ?? 'UNKNOWN')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/gameUtils.test.js
```

Expected: 11 passing.

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/lib/gameUtils.js ti4-companion-web/tests/lib/gameUtils.test.js
git commit -m "feat: add gameUtils.js with deriveActivePlayer, deriveSpeaker, phaseLabel"
```

---

## Task 11: Extend `useGame` for the game screen

**Files:**
- Modify: `ti4-companion-web/src/hooks/useGame.js`
- Modify: `ti4-companion-web/tests/hooks/useGame.test.js`
- Create: `ti4-companion-web/tests/hooks/useGame.phase3.test.js`

- [ ] **Step 1: Update the existing mock in `useGame.test.js`**

The hook now uses `useLocation`. Add it to the mock. In `tests/hooks/useGame.test.js`, change the `react-router-dom` mock from:

```js
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))
```

to:

```js
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/lobby/ABC123' }),
}))
```

- [ ] **Step 2: Run the existing useGame tests to confirm they still pass**

```bash
npx vitest run tests/hooks/useGame.test.js
```

Expected: all 8 tests still passing.

- [ ] **Step 3: Write failing Phase 3 hook tests**

`ti4-companion-web/tests/hooks/useGame.phase3.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockNavigate = vi.fn()
let mockPathname = '/game/ABC123'

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPathname }),
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
}))

import { supabase } from '../../src/lib/supabase.js'
import { endTurn, passAction } from '../../src/lib/edgeFunctions.js'
import { useGame } from '../../src/hooks/useGame.js'

const GAME = {
  id: 'game-uuid',
  code: 'ABC123',
  host_user_id: 'host-uuid',
  status: 'active',
  phase: 'action',
  round: 2,
  vp_goal: 10,
  speaker_player_id: 'p1',
  active_player_id: 'p1',
}
const PLAYERS = [
  { id: 'p1', user_id: 'host-uuid', display_name: 'Alice', strategy_card: 1, passed: false, vp: 5 },
  { id: 'p2', user_id: 'other-uuid', display_name: 'Bob', strategy_card: 3, passed: false, vp: 3 },
]
const OBJECTIVES = [
  { id: 'go1', objective_id: 'ref-obj-1', state: 'revealed', deck_position: 0, scored_by: ['p1'],
    public_objectives: { name: 'Spend 8 Resources', stage: 1, points: 1 } },
]
const PLANETS = [
  { id: 'pl1', game_id: 'game-uuid', player_id: 'p1', planet_name: 'Mecatol Rex', exhausted: false },
]

function mockGameScreenLoad() {
  let callCount = 0
  supabase.from.mockImplementation(() => {
    callCount++
    if (callCount === 1) return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: GAME, error: null }),
        }),
      }),
    }
    if (callCount === 2) return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: PLAYERS, error: null }),
      }),
    }
    if (callCount === 3) return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: OBJECTIVES, error: null }),
      }),
    }
    // game_player_planets
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: PLANETS, error: null }),
      }),
    }
  })
}

describe('useGame (game screen path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname = '/game/ABC123'
    mockChannel.on.mockImplementation(() => mockChannel)
    mockChannel.subscribe.mockReturnValue(mockChannel)
    mockGameScreenLoad()
  })

  it('does NOT navigate away when on /game/ route with active game', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('loads objectives and planets on game screen', async () => {
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.objectives).toHaveLength(1)
    expect(result.current.planets).toHaveLength(1)
  })

  it('exposes endTurn wrapper that calls endTurn edge function', async () => {
    endTurn.mockResolvedValue({ advanced: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.endTheTurn() })
    expect(endTurn).toHaveBeenCalledWith('game-uuid')
  })

  it('exposes passAction wrapper that calls passAction edge function', async () => {
    passAction.mockResolvedValue({ passed: true })
    const { result } = renderHook(() => useGame('ABC123', 'host-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.passTheAction() })
    expect(passAction).toHaveBeenCalledWith('game-uuid')
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run tests/hooks/useGame.phase3.test.js
```

Expected: FAIL — `objectives`, `planets`, `endTheTurn`, `passTheAction` not on hook yet.

- [ ] **Step 5: Rewrite `useGame.js` with Phase 3 extensions**

`ti4-companion-web/src/hooks/useGame.js`:

```js
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import {
  updateGameSettings, pickFactionColor, setSpeaker, startGame,
  endTurn, passAction, advancePhase, scoreObjective,
  revealObjective, shuffleDeck, updateCommandTokens,
} from '../lib/edgeFunctions.js'

export function useGame(code, userId) {
  const navigate = useNavigate()
  const location = useLocation()
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [objectives, setObjectives] = useState([])
  const [planets, setPlanets] = useState([])
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

      // Redirect lobby → game when game becomes active
      if (gameData.status === 'active' && !isGameScreen) {
        navigate(`/game/${code}`, { replace: true })
        return
      }

      // Load objectives + planets only on the game screen
      let objectivesData = []
      let planetsData = []
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
      }

      setGame(gameData)
      setPlayers(playersData ?? [])
      setObjectives(objectivesData)
      setPlanets(planetsData)
      setLoading(false)

      // Realtime subscriptions
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

  // Direct Supabase writes (client-side per architecture)
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
  }
}
```

- [ ] **Step 6: Run Phase 3 hook tests to verify they pass**

```bash
npx vitest run tests/hooks/useGame.phase3.test.js
```

Expected: 4 passing.

- [ ] **Step 7: Run full test suite to check for regressions**

```bash
npm test
```

Expected: all existing tests passing + new tests.

- [ ] **Step 8: Commit**

```bash
git add ti4-companion-web/src/hooks/useGame.js ti4-companion-web/tests/hooks/useGame.test.js ti4-companion-web/tests/hooks/useGame.phase3.test.js
git commit -m "feat: extend useGame with objectives, planets, and Phase 3 action wrappers"
```

---

## Task 12: `ScoreboardSection` component (TDD)

**Files:**
- Create: `ti4-companion-web/src/components/game/ScoreboardSection.jsx`
- Create: `ti4-companion-web/tests/components/game/ScoreboardSection.test.jsx`

- [ ] **Step 1: Write failing tests**

`ti4-companion-web/tests/components/game/ScoreboardSection.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScoreboardSection from '../../../src/components/game/ScoreboardSection.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice', faction: 'Arborec', colour: 'green',  strategy_card: 1, passed: false, vp: 8 },
  { id: 'p2', display_name: 'Bob',   faction: 'Letnev',  colour: 'red',    strategy_card: 3, passed: true,  vp: 5 },
  { id: 'p3', display_name: 'Carol', faction: 'Saar',    colour: 'yellow', strategy_card: 5, passed: false, vp: 3 },
]

const ACTION_GAME = { phase: 'action', active_player_id: 'p1' }

function renderScoreboard(props = {}) {
  return render(
    <ScoreboardSection
      players={PLAYERS}
      game={ACTION_GAME}
      currentPlayerId="p1"
      {...props}
    />
  )
}

describe('ScoreboardSection', () => {
  it('renders all player names', () => {
    renderScoreboard()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Carol')).toBeInTheDocument()
  })

  it('shows ACTIVE badge for the active player', () => {
    renderScoreboard()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  })

  it('shows PASSED badge for passed players', () => {
    renderScoreboard()
    expect(screen.getByText('PASSED')).toBeInTheDocument()
  })

  it('shows VP for each player', () => {
    renderScoreboard()
    expect(screen.getByText('8 VP')).toBeInTheDocument()
    expect(screen.getByText('5 VP')).toBeInTheDocument()
    expect(screen.getByText('3 VP')).toBeInTheDocument()
  })

  it('shows strategy card number when assigned', () => {
    renderScoreboard()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows no active/passed badge during strategy phase', () => {
    renderScoreboard({ game: { phase: 'strategy', active_player_id: null } })
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument()
    expect(screen.queryByText('PASSED')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/game/ScoreboardSection.test.jsx
```

Expected: FAIL — component not found.

- [ ] **Step 3: Create `ScoreboardSection.jsx`**

`ti4-companion-web/src/components/game/ScoreboardSection.jsx`:

```jsx
import { deriveActivePlayer } from '../../lib/gameUtils.js'

const COLOUR_HEX = {
  blue: '#58a6ff', red: '#f85149', green: '#3fb950', yellow: '#e3b341',
  orange: '#f0883e', pink: '#ff7bda', purple: '#bc8cff', white: '#f0f6fc',
}

export default function ScoreboardSection({ players, game, currentPlayerId }) {
  const activePlayer = deriveActivePlayer(players, game)
  const sorted = [...players].sort((a, b) => b.vp - a.vp)

  return (
    <div>
      <p className="label mb-2">SCOREBOARD</p>
      <div className="flex flex-col gap-2">
        {sorted.map(player => {
          const isActive = activePlayer?.id === player.id
          const isPassed = player.passed
          const isMe = player.id === currentPlayerId

          return (
            <div
              key={player.id}
              className={`flex items-center gap-3 px-3 py-2 rounded border transition-opacity ${
                isActive ? 'border-plasma bg-panel' : 'border-border bg-hull'
              } ${isPassed ? 'opacity-60' : ''}`}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLOUR_HEX[player.colour] ?? '#6e7681' }}
              />
              <span className={`flex-1 font-body text-sm ${isMe ? 'text-bright' : 'text-text'}`}>
                {player.display_name}
                {player.faction && (
                  <span className="text-dim text-xs ml-2">({player.faction})</span>
                )}
              </span>
              {player.strategy_card != null && (
                <span className="label text-xs bg-hull px-1 rounded border border-border">
                  {player.strategy_card}
                </span>
              )}
              {game?.phase === 'action' && isActive && (
                <span className="label text-plasma text-xs">ACTIVE</span>
              )}
              {game?.phase === 'action' && isPassed && !isActive && (
                <span className="label text-success text-xs">PASSED</span>
              )}
              <span className="font-display text-gold text-sm font-bold">{player.vp} VP</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/game/ScoreboardSection.test.jsx
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/ScoreboardSection.jsx ti4-companion-web/tests/components/game/ScoreboardSection.test.jsx
git commit -m "feat: add ScoreboardSection component with tests"
```

---

## Task 13: `MyPanelSection` component (TDD)

**Files:**
- Create: `ti4-companion-web/src/components/game/MyPanelSection.jsx`
- Create: `ti4-companion-web/tests/components/game/MyPanelSection.test.jsx`

- [ ] **Step 1: Write failing tests**

`ti4-companion-web/tests/components/game/MyPanelSection.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MyPanelSection from '../../../src/components/game/MyPanelSection.jsx'

const PLAYER = {
  id: 'p1', display_name: 'Alice', faction: 'Arborec', colour: 'green',
  strategy_card: null, passed: false, vp: 5,
  command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 },
  commodities: 3, trade_goods: 1,
  technologies: ['Neural Motivator', 'Sarween Tools'],
  leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' },
}
const PLANETS = [
  { id: 'pl1', player_id: 'p1', planet_name: 'Mecatol Rex', exhausted: false },
  { id: 'pl2', player_id: 'p1', planet_name: 'Jord', exhausted: true },
]

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
      {...overrides}
    />
  )
}

describe('MyPanelSection', () => {
  it('renders command token counts', () => {
    renderPanel()
    expect(screen.getByText('3')).toBeInTheDocument() // tactic or fleet
  })

  it('renders commodities and trade goods', () => {
    renderPanel()
    expect(screen.getByText('3')).toBeInTheDocument() // commodities
    expect(screen.getByText('1')).toBeInTheDocument() // trade goods
  })

  it('renders planet names', () => {
    renderPanel()
    expect(screen.getByText('Mecatol Rex')).toBeInTheDocument()
    expect(screen.getByText('Jord')).toBeInTheDocument()
  })

  it('shows PASS and END TURN buttons when isActive=true', () => {
    renderPanel({ isActive: true })
    expect(screen.getByRole('button', { name: /pass/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /end turn/i })).toBeInTheDocument()
  })

  it('hides PASS and END TURN buttons when isActive=false', () => {
    renderPanel({ isActive: false })
    expect(screen.queryByRole('button', { name: /pass/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /end turn/i })).not.toBeInTheDocument()
  })

  it('calls onPass when PASS button is clicked', () => {
    const onPass = vi.fn()
    renderPanel({ isActive: true, onPass })
    fireEvent.click(screen.getByRole('button', { name: /pass/i }))
    expect(onPass).toHaveBeenCalledOnce()
  })

  it('calls onEndTurn when END TURN button is clicked', () => {
    const onEndTurn = vi.fn()
    renderPanel({ isActive: true, onEndTurn })
    fireEvent.click(screen.getByRole('button', { name: /end turn/i }))
    expect(onEndTurn).toHaveBeenCalledOnce()
  })

  it('shows token redistribution controls during status phase', () => {
    renderPanel({ game: { phase: 'status' } })
    expect(screen.getByRole('button', { name: /confirm tokens/i })).toBeInTheDocument()
  })

  it('hides token redistribution controls outside status phase', () => {
    renderPanel({ game: { phase: 'action' } })
    expect(screen.queryByRole('button', { name: /confirm tokens/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/game/MyPanelSection.test.jsx
```

Expected: FAIL — component not found.

- [ ] **Step 3: Create `MyPanelSection.jsx`**

`ti4-companion-web/src/components/game/MyPanelSection.jsx`:

```jsx
import { useState } from 'react'

export default function MyPanelSection({
  player, planets, isActive, game,
  onPass, onEndTurn, onUpdateTokens,
  onExhaustPlanet, onReadyPlanet,
  onPickStrategyCard, onUpdateCommodities, onUpdateTradeGoods, onCycleLeader,
}) {
  const tokens = player?.command_tokens ?? { tactic_total: 0, fleet: 0, strategy: 0 }
  const [draftTokens, setDraftTokens] = useState(tokens)
  const isStatusPhase = game?.phase === 'status'

  if (!player) return null

  return (
    <div className="panel flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="label">MY PANEL</p>
        {isActive && (
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" onClick={onPass}>PASS</button>
            <button className="btn-primary text-xs" onClick={onEndTurn}>END TURN</button>
          </div>
        )}
      </div>

      {/* Command Tokens */}
      <div className="flex gap-6">
        {[
          { key: 'tactic_total', label: 'TACTIC' },
          { key: 'fleet',        label: 'FLEET' },
          { key: 'strategy',     label: 'STRATEGY' },
        ].map(({ key, label }) => (
          <div key={key} className="text-center">
            <p className="label text-xs">{label}</p>
            {isStatusPhase ? (
              <div className="flex items-center gap-1">
                <button
                  className="counter-btn"
                  onClick={() => setDraftTokens(t => ({ ...t, [key]: Math.max(0, t[key] - 1) }))}
                >−</button>
                <span className="font-display text-bright text-lg w-6 text-center">{draftTokens[key]}</span>
                <button
                  className="counter-btn"
                  onClick={() => setDraftTokens(t => ({ ...t, [key]: t[key] + 1 }))}
                >+</button>
              </div>
            ) : (
              <span className="font-display text-bright text-lg">{tokens[key]}</span>
            )}
          </div>
        ))}

        <div className="border-l border-border pl-6 flex gap-6">
          <div className="text-center">
            <p className="label text-xs">COMMOD.</p>
            <div className="flex items-center gap-1">
              <button className="counter-btn" onClick={() => onUpdateCommodities(Math.max(0, player.commodities - 1))}>−</button>
              <span className="font-display text-bright text-lg">{player.commodities}</span>
              <button className="counter-btn" onClick={() => onUpdateCommodities(player.commodities + 1)}>+</button>
            </div>
          </div>
          <div className="text-center">
            <p className="label text-xs">TRADE</p>
            <div className="flex items-center gap-1">
              <button className="counter-btn" onClick={() => onUpdateTradeGoods(Math.max(0, player.trade_goods - 1))}>−</button>
              <span className="font-display text-bright text-lg">{player.trade_goods}</span>
              <button className="counter-btn" onClick={() => onUpdateTradeGoods(player.trade_goods + 1)}>+</button>
            </div>
          </div>
        </div>
      </div>

      {isStatusPhase && (
        <div className="flex justify-end">
          <button
            className="btn-primary text-xs"
            onClick={() => onUpdateTokens(draftTokens)}
          >
            CONFIRM TOKENS
          </button>
        </div>
      )}

      {/* Planets */}
      {planets.length > 0 && (
        <div>
          <p className="label text-xs mb-2">PLANETS</p>
          <div className="flex flex-col gap-1">
            {planets.map(planet => (
              <div key={planet.id} className="flex items-center justify-between text-sm">
                <span className={planet.exhausted ? 'text-dim line-through' : 'text-text'}>
                  {planet.planet_name}
                </span>
                <button
                  className="label text-xs hover:text-text"
                  onClick={() => planet.exhausted ? onReadyPlanet(planet.planet_name) : onExhaustPlanet(planet.planet_name)}
                >
                  {planet.exhausted ? 'READY' : 'EXHAUST'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Technologies */}
      {player.technologies?.length > 0 && (
        <div>
          <p className="label text-xs mb-1">TECHNOLOGIES ({player.technologies.length})</p>
          <p className="text-dim text-xs">{player.technologies.join(' · ')}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/game/MyPanelSection.test.jsx
```

Expected: 9 passing.

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/MyPanelSection.jsx ti4-companion-web/tests/components/game/MyPanelSection.test.jsx
git commit -m "feat: add MyPanelSection component with tests"
```

---

## Task 14: `ObjectivesSection` component (TDD)

**Files:**
- Create: `ti4-companion-web/src/components/game/ObjectivesSection.jsx`
- Create: `ti4-companion-web/tests/components/game/ObjectivesSection.test.jsx`

- [ ] **Step 1: Write failing tests**

`ti4-companion-web/tests/components/game/ObjectivesSection.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ObjectivesSection from '../../../src/components/game/ObjectivesSection.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice' },
  { id: 'p2', display_name: 'Bob' },
]
const OBJECTIVES = [
  {
    id: 'go1', state: 'revealed', scored_by: ['p1'],
    public_objectives: { name: 'Spend 8 Resources', stage: 1, points: 1 },
  },
  {
    id: 'go2', state: 'revealed', scored_by: [],
    public_objectives: { name: 'Control 6 Planets', stage: 1, points: 1 },
  },
  {
    id: 'go3', state: 'deck', scored_by: [],
    public_objectives: { name: 'Secret Deck Card', stage: 2, points: 2 },
  },
]

describe('ObjectivesSection', () => {
  it('renders revealed objective names', () => {
    render(<ObjectivesSection objectives={OBJECTIVES} players={PLAYERS} />)
    expect(screen.getByText('Spend 8 Resources')).toBeInTheDocument()
    expect(screen.getByText('Control 6 Planets')).toBeInTheDocument()
  })

  it('does not render deck objectives', () => {
    render(<ObjectivesSection objectives={OBJECTIVES} players={PLAYERS} />)
    expect(screen.queryByText('Secret Deck Card')).not.toBeInTheDocument()
  })

  it('shows scorer display names for scored objectives', () => {
    render(<ObjectivesSection objectives={OBJECTIVES} players={PLAYERS} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows empty state when no objectives are revealed', () => {
    render(<ObjectivesSection objectives={[]} players={PLAYERS} />)
    expect(screen.getByText(/no objectives revealed/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/game/ObjectivesSection.test.jsx
```

Expected: FAIL — component not found.

- [ ] **Step 3: Create `ObjectivesSection.jsx`**

`ti4-companion-web/src/components/game/ObjectivesSection.jsx`:

```jsx
export default function ObjectivesSection({ objectives, players }) {
  const revealed = objectives.filter(o => o.state === 'revealed')

  return (
    <div>
      <p className="label mb-2">PUBLIC OBJECTIVES</p>
      {revealed.length === 0 ? (
        <p className="text-dim text-sm">No objectives revealed yet.</p>
      ) : (
        <div className="panel-inset flex flex-col gap-3">
          {revealed.map(obj => {
            const ref = obj.public_objectives
            const scorers = (obj.scored_by ?? [])
              .map(pid => players.find(p => p.id === pid)?.display_name)
              .filter(Boolean)

            return (
              <div key={obj.id} className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-text text-sm">{ref?.name}</span>
                  <span className="text-dim text-xs ml-2">
                    Stage {ref?.stage} · {ref?.points ?? 1} VP
                  </span>
                </div>
                <div className="text-xs text-success flex-shrink-0">
                  {scorers.length > 0 ? scorers.join(', ') : <span className="text-dim">—</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/game/ObjectivesSection.test.jsx
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/ObjectivesSection.jsx ti4-companion-web/tests/components/game/ObjectivesSection.test.jsx
git commit -m "feat: add ObjectivesSection component with tests"
```

---

## Task 15: `HostControlsSection` component (TDD)

**Files:**
- Create: `ti4-companion-web/src/components/game/HostControlsSection.jsx`
- Create: `ti4-companion-web/tests/components/game/HostControlsSection.test.jsx`

- [ ] **Step 1: Write failing tests**

`ti4-companion-web/tests/components/game/HostControlsSection.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HostControlsSection from '../../../src/components/game/HostControlsSection.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice', vp: 5 },
  { id: 'p2', display_name: 'Bob',   vp: 3 },
]
const OBJECTIVES = [
  {
    id: 'go1', state: 'revealed', scored_by: [],
    public_objectives: { name: 'Spend 8 Resources', stage: 1, points: 1 },
  },
]

function renderControls(isHost = true) {
  return render(
    <HostControlsSection
      isHost={isHost}
      game={{ phase: 'action', round: 2 }}
      players={PLAYERS}
      objectives={OBJECTIVES}
      onScoreObjective={vi.fn()}
      onRevealObjective={vi.fn()}
      onShuffleDeck={vi.fn()}
      onAdvancePhase={vi.fn()}
    />
  )
}

describe('HostControlsSection', () => {
  it('renders Advance Phase button for host', () => {
    renderControls(true)
    expect(screen.getByRole('button', { name: /advance phase/i })).toBeInTheDocument()
  })

  it('renders Reveal Objective button for host', () => {
    renderControls(true)
    expect(screen.getByRole('button', { name: /reveal objective/i })).toBeInTheDocument()
  })

  it('renders Shuffle Deck button for host', () => {
    renderControls(true)
    expect(screen.getByRole('button', { name: /shuffle/i })).toBeInTheDocument()
  })

  it('renders nothing for non-host', () => {
    const { container } = renderControls(false)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/game/HostControlsSection.test.jsx
```

Expected: FAIL — component not found.

- [ ] **Step 3: Create `HostControlsSection.jsx`**

`ti4-companion-web/src/components/game/HostControlsSection.jsx`:

```jsx
import { useState } from 'react'

const PHASE_LABELS = { strategy: 'Action', action: 'Status', status: 'Strategy' }

export default function HostControlsSection({
  isHost, game, players, objectives,
  onScoreObjective, onRevealObjective, onShuffleDeck, onAdvancePhase,
}) {
  const [scoringObj, setScoringObj] = useState(null)
  const [scoringPlayer, setScoringPlayer] = useState('')

  if (!isHost) return null

  const revealedObjs = objectives.filter(o => o.state === 'revealed')
  const nextPhaseLabel = PHASE_LABELS[game?.phase] ?? '?'

  return (
    <div className="panel flex flex-col gap-4">
      <p className="label">HOST CONTROLS</p>

      {/* Score Objective */}
      <div className="flex flex-col gap-2">
        <p className="text-dim text-xs">SCORE OBJECTIVE</p>
        <div className="flex gap-2 flex-wrap">
          <select
            className="input text-xs flex-1"
            value={scoringObj ?? ''}
            onChange={e => setScoringObj(e.target.value || null)}
          >
            <option value="">Select objective…</option>
            {revealedObjs.map(o => (
              <option key={o.id} value={o.id}>{o.public_objectives?.name}</option>
            ))}
          </select>
          <select
            className="input text-xs flex-1"
            value={scoringPlayer}
            onChange={e => setScoringPlayer(e.target.value)}
          >
            <option value="">Select player…</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
          <button
            className="btn-ghost text-xs"
            disabled={!scoringObj || !scoringPlayer}
            onClick={() => {
              onScoreObjective(scoringObj, scoringPlayer)
              setScoringObj(null)
              setScoringPlayer('')
            }}
          >
            SCORE
          </button>
        </div>
      </div>

      {/* Reveal + Shuffle */}
      <div className="flex gap-2 flex-wrap">
        <button className="btn-ghost text-xs" onClick={() => onRevealObjective(1)}>
          REVEAL OBJECTIVE (S1)
        </button>
        <button className="btn-ghost text-xs" onClick={() => onRevealObjective(2)}>
          REVEAL OBJECTIVE (S2)
        </button>
        <button className="btn-ghost text-xs" onClick={() => onShuffleDeck('public_objectives_1')}>
          SHUFFLE S1
        </button>
        <button className="btn-ghost text-xs" onClick={() => onShuffleDeck('public_objectives_2')}>
          SHUFFLE S2
        </button>
      </div>

      {/* Advance Phase */}
      <div className="flex justify-end">
        <button className="btn-primary" onClick={onAdvancePhase}>
          ADVANCE PHASE → {nextPhaseLabel.toUpperCase()}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/game/HostControlsSection.test.jsx
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/HostControlsSection.jsx ti4-companion-web/tests/components/game/HostControlsSection.test.jsx
git commit -m "feat: add HostControlsSection component with tests"
```

---

## Task 16: `GameHeader`, `GameScreen`, and `App.jsx` update

**Files:**
- Create: `ti4-companion-web/src/components/game/GameHeader.jsx`
- Create: `ti4-companion-web/src/components/game/GameScreen.jsx`
- Modify: `ti4-companion-web/src/App.jsx`
- Delete: `ti4-companion-web/src/components/game/GamePlaceholder.jsx`

No unit tests — `GameScreen` is a thin wiring component; `GameHeader` has no logic.

- [ ] **Step 1: Create `GameHeader.jsx`**

`ti4-companion-web/src/components/game/GameHeader.jsx`:

```jsx
import { phaseLabel } from '../../lib/gameUtils.js'

export default function GameHeader({ game, speaker }) {
  return (
    <div className="bg-hull border-b border-border px-6 py-3 flex items-center justify-between sticky top-0 z-10">
      <span className="font-display text-plasma text-xs tracking-widest">
        ROUND {game?.round ?? '—'}
      </span>
      <span className="font-display text-bright text-xs tracking-widest">
        {phaseLabel(game?.phase)}
      </span>
      <span className="text-dim text-xs">
        GOAL: {game?.vp_goal ?? '?'} VP
        {speaker && <> · 🎙 {speaker.display_name}</>}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Create `GameScreen.jsx`**

`ti4-companion-web/src/components/game/GameScreen.jsx`:

```jsx
import { useParams } from 'react-router-dom'
import { useGame } from '../../hooks/useGame.js'
import { deriveActivePlayer, deriveSpeaker } from '../../lib/gameUtils.js'
import GameHeader from './GameHeader.jsx'
import ScoreboardSection from './ScoreboardSection.jsx'
import MyPanelSection from './MyPanelSection.jsx'
import ObjectivesSection from './ObjectivesSection.jsx'
import HostControlsSection from './HostControlsSection.jsx'

export default function GameScreen({ userId }) {
  const { code } = useParams()
  const {
    game, players, objectives, planets, currentPlayer, isHost, loading, error,
    endTheTurn, passTheAction, advanceThePhase,
    scoreAnObjective, revealAnObjective, shuffleTheDeck,
    updateTokens, exhaustPlanet, readyPlanet,
    pickStrategyCard, updateCommodities, updateTradeGoods, cycleLeader,
  } = useGame(code, userId)

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
    </div>
  )
}
```

- [ ] **Step 3: Update `App.jsx`**

In `ti4-companion-web/src/App.jsx`, replace `GamePlaceholder` with `GameScreen`:

1. Remove the `import GamePlaceholder` line.
2. Add `import GameScreen from './components/game/GameScreen.jsx'`
3. Change the `/game/:code` route from:
   ```jsx
   <GamePlaceholder />
   ```
   to:
   ```jsx
   <GameScreen userId={user?.id} />
   ```

The full updated import block at the top of `App.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.js'
import LoginScreen from './components/auth/LoginScreen.jsx'
import VerifyScreen from './components/auth/VerifyScreen.jsx'
import ProtectedRoute from './components/shared/ProtectedRoute.jsx'
import AdminRoute from './components/admin/AdminRoute.jsx'
import AdminDashboard from './components/admin/AdminDashboard.jsx'
import AdminImportPage from './components/admin/AdminImportPage.jsx'
import SetupScreen from './components/game/SetupScreen.jsx'
import LobbyScreen from './components/game/LobbyScreen.jsx'
import GameScreen from './components/game/GameScreen.jsx'
import { joinGame } from './lib/edgeFunctions.js'
```

And the updated `/game/:code` route:

```jsx
<Route
  path="/game/:code"
  element={
    <ProtectedRoute user={user} loading={loading}>
      <GameScreen userId={user?.id} />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 4: Delete `GamePlaceholder.jsx`**

```bash
rm ti4-companion-web/src/components/game/GamePlaceholder.jsx
```

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/GameHeader.jsx
git add ti4-companion-web/src/components/game/GameScreen.jsx
git add ti4-companion-web/src/App.jsx
git rm ti4-companion-web/src/components/game/GamePlaceholder.jsx
git commit -m "feat: add GameScreen, GameHeader; wire into App.jsx; delete GamePlaceholder"
```

---

## Task 17: Full test run and dev server verification

- [ ] **Step 1: Run the full test suite**

```bash
cd ti4-companion-web && npm test
```

Expected: all tests pass. If any fail, fix them before continuing.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 3: Verify the game screen renders**

Navigate to `http://localhost:5173`. Log in with a magic link if not already authenticated. Start or join a game and advance it to `active` via the lobby. Verify:

- `GameHeader` shows the round number, phase name, VP goal, and speaker name
- `ScoreboardSection` renders all players with their VP; active player is highlighted in blue; passed players are dimmed with PASSED badge
- `MyPanelSection` shows command tokens, commodities, trade goods, and planet list for the current player
- PASS and END TURN buttons appear only when it is the current player's turn
- CONFIRM TOKENS button appears in My Panel only during the Status phase
- `ObjectivesSection` shows "No objectives revealed yet" when none have been revealed; reveals update in real time when the host clicks Reveal Objective
- `HostControlsSection` is visible for the host and absent for other players; Advance Phase button advances through Strategy → Action → Status → Strategy (next round)
- Command tokens, commodities, and planet exhaust state update in real time for all players

- [ ] **Step 4: Commit any fixes found during verification**

```bash
git add -p   # stage only the changed files
git commit -m "fix: <describe what was fixed>"
```

---

## Self-Review

**Spec coverage:**
- ✅ Single scrolling page at `/game/:code` — `GameScreen` with sections stacked
- ✅ Information visibility — VP/strategy/passed/command tokens/technologies/planets all in `ScoreboardSection` and `MyPanelSection`
- ✅ Active player tracking by initiative order — `active_player_id` on `games`, managed by `game-end-turn` and `game-player-pass`
- ✅ Three phases (strategy/action/status) — `game-advance-phase`
- ✅ Status phase key actions only — token redistribution in `MyPanelSection`, planet readying in `game-advance-phase`
- ✅ Public objective reveal + scoring — `game-reveal-objective`, `game-score-objective`, `ObjectivesSection`, `HostControlsSection`
- ✅ Generic deck shuffle — `game-shuffle-deck` with all 9 deck types
- ✅ Migration 007 — `active_player_id` + objective deck columns
- ✅ `game-start` updated — objective deck initialization
- ✅ `deriveActivePlayer`, `deriveSpeaker`, `phaseLabel` utilities — `gameUtils.js`
- ✅ `HostControlsSection` hidden for non-hosts — `if (!isHost) return null`
- ✅ Testing — unit tests for `gameUtils`, wrapper tests for new Edge Functions, rendering tests for all four sections, integration tests for `useGame` Phase 3 path

**Placeholder scan:** No TBDs, no "handle edge cases", no "similar to Task N" references.

**Type consistency:**
- `useGame` returns `endTheTurn`, `passTheAction`, etc. — `GameScreen` calls these exact names ✅
- `HostControlsSection` receives `onScoreObjective(objectiveId, playerId)` — `game-score-objective` wrapper takes `(gameId, objectiveId, playerId)` — `scoreAnObjective(objectiveId, playerId)` wrapper in `useGame` matches ✅
- `MyPanelSection` receives `onUpdateTokens` — `useGame` exposes `updateTokens` — `GameScreen` passes `updateTokens` as `onUpdateTokens` ✅
- `revealAnObjective(stage)` in `useGame` → `revealObjective(gameId, stage)` in `edgeFunctions.js` → `game-reveal-objective` body `{ game_id, stage }` ✅
