# Phase 5b — Ability Resolution Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side ability resolution pipeline: a DSL interpreter that executes composable effect ops against game state, a named handler registry for complex effects, and two Edge Functions (`game-resolve-ability`, `game-unlock-commander`) that validate triggers and dispatch to both.

**Architecture:** `_shared/abilityDsl.ts` is a pure function `interpretEffects(effects, context, db)` — no module-level state, fully testable via dependency injection. `_shared/abilityHandlers.ts` is a registry of named TypeScript functions for effects that can't be expressed as ops. `game-resolve-ability` orchestrates auth → player lookup → ability load → source verification → dispatch → exhaust/purge. `game-unlock-commander` evaluates `unlock_conditions` against live game state and flips the commander status.

**Tech Stack:** Deno/TypeScript (Edge Functions), Supabase JS v2, Vitest 4

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/functions/_shared/abilityDsl.ts` |
| Create | `supabase/functions/_shared/abilityHandlers.ts` |
| Create | `supabase/functions/game-resolve-ability/index.ts` |
| Create | `supabase/functions/game-unlock-commander/index.ts` |
| Modify | `ti4-companion-web/src/lib/edgeFunctions.js` |
| Create | `ti4-companion-web/tests/lib/abilityDsl.test.js` |
| Create | `ti4-companion-web/tests/functions/game-resolve-ability.test.js` |
| Create | `ti4-companion-web/tests/functions/game-unlock-commander.test.js` |
| Create | `ti4-companion-web/tests/lib/edgeFunctions.phase5b.test.js` |

---

## Task 1: DSL interpreter — `_shared/abilityDsl.ts` (TDD)

**Files:**
- Create: `supabase/functions/_shared/abilityDsl.ts`
- Create: `ti4-companion-web/tests/lib/abilityDsl.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/lib/abilityDsl.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'

// Build a mock db that returns `player` on game_players select and tracks updates.
function makeDb({ player = { id: 'p1', trade_goods: 3, commodities: 2, vp: 5, technologies: [], action_card_count: 0 }, updateError = null, deckCard = null } = {}) {
  const updateChain = { eq: vi.fn().mockResolvedValue({ error: updateError }) }
  const updateMock = vi.fn().mockReturnValue(updateChain)

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
      if (table === 'game_action_card_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: deckCard, error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      return {}
    }),
  }
  return { db, updateMock, updateChain }
}

const CTX = { gameId: 'g1', activatingPlayerId: 'p1' }

describe('interpretEffects', () => {
  it('gain_trade_goods adds amount to player trade_goods', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 3, commodities: 2, vp: 5, technologies: [], action_card_count: 0 } })
    await interpretEffects([{ op: 'gain_trade_goods', amount: 2 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ trade_goods: 5 })
  })

  it('spend_trade_goods subtracts chosen_amount from trade_goods', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 5, commodities: 0, vp: 0, technologies: [], action_card_count: 0 } })
    await interpretEffects([{ op: 'spend_trade_goods', amount: 'chosen_amount' }], { ...CTX, chosenAmount: 3 }, db)
    expect(updateMock).toHaveBeenCalledWith({ trade_goods: 2 })
  })

  it('spend_trade_goods does not go below 0', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 1, commodities: 0, vp: 0, technologies: [], action_card_count: 0 } })
    await interpretEffects([{ op: 'spend_trade_goods', amount: 5 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ trade_goods: 0 })
  })

  it('gain_vp increments vp', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 4, technologies: [], action_card_count: 0 } })
    await interpretEffects([{ op: 'gain_vp', amount: 1 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ vp: 5 })
  })

  it('lose_vp does not go below 0', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0 } })
    await interpretEffects([{ op: 'lose_vp', amount: 1 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ vp: 0 })
  })

  it('gain_commodities increments commodities', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 0, commodities: 2, vp: 0, technologies: [], action_card_count: 0 } })
    await interpretEffects([{ op: 'gain_commodities', amount: 2 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ commodities: 4 })
  })

  it('choose_one executes the op at chosenOption index', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 2, commodities: 0, vp: 3, technologies: [], action_card_count: 0 } })
    await interpretEffects(
      [{ op: 'choose_one', options: [{ op: 'gain_vp', amount: 1 }, { op: 'gain_trade_goods', amount: 2 }] }],
      { ...CTX, chosenOption: 1 },
      db
    )
    expect(updateMock).toHaveBeenCalledWith({ trade_goods: 4 })
  })

  it('choose_one defaults to index 0 when chosenOption is undefined', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 3, technologies: [], action_card_count: 0 } })
    await interpretEffects(
      [{ op: 'choose_one', options: [{ op: 'gain_vp', amount: 1 }, { op: 'gain_trade_goods', amount: 2 }] }],
      CTX,
      db
    )
    expect(updateMock).toHaveBeenCalledWith({ vp: 4 })
  })

  it('throws on unknown op', async () => {
    const { db } = makeDb()
    await expect(
      interpretEffects([{ op: 'unknown_op_xyz' }], CTX, db)
    ).rejects.toThrow('Unknown op: unknown_op_xyz')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/lib/abilityDsl.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `supabase/functions/_shared/abilityDsl.ts`**

```typescript
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ResolveContext {
  gameId: string
  activatingPlayerId: string
  targetPlayerId?: string
  targetPlanetName?: string
  chosenAmount?: number
  chosenOption?: number
}

type PlayerRow = Record<string, unknown>

export async function interpretEffects(
  effects: unknown[],
  context: ResolveContext,
  db: SupabaseClient
): Promise<void> {
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, trade_goods, commodities, vp, technologies, action_card_count')
    .eq('id', context.activatingPlayerId)
    .maybeSingle()

  if (playerError || !player) throw new Error('Failed to load player data')

  for (const rawEffect of effects) {
    await interpretOp(rawEffect as Record<string, unknown>, context, player as PlayerRow, db)
  }
}

async function interpretOp(
  op: Record<string, unknown>,
  context: ResolveContext,
  player: PlayerRow,
  db: SupabaseClient
): Promise<void> {
  switch (op.op) {
    case 'gain_trade_goods': {
      const amount = resolveAmount(op.amount as number | string, context)
      const { error } = await db
        .from('game_players')
        .update({ trade_goods: (player.trade_goods as number) + amount })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_trade_goods failed: ${error.message}`)
      break
    }
    case 'spend_trade_goods': {
      const amount = resolveAmount(op.amount as number | string, context)
      const { error } = await db
        .from('game_players')
        .update({ trade_goods: Math.max(0, (player.trade_goods as number) - amount) })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`spend_trade_goods failed: ${error.message}`)
      break
    }
    case 'gain_commodities': {
      const amount = resolveAmount(op.amount as number | string, context)
      const { error } = await db
        .from('game_players')
        .update({ commodities: (player.commodities as number) + amount })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_commodities failed: ${error.message}`)
      break
    }
    case 'gain_vp': {
      const { error } = await db
        .from('game_players')
        .update({ vp: (player.vp as number) + (op.amount as number) })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_vp failed: ${error.message}`)
      break
    }
    case 'lose_vp': {
      const { error } = await db
        .from('game_players')
        .update({ vp: Math.max(0, (player.vp as number) - (op.amount as number)) })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`lose_vp failed: ${error.message}`)
      break
    }
    case 'draw_action_card': {
      const { data: topCard, error: deckError } = await db
        .from('game_action_card_deck')
        .select('id')
        .eq('game_id', context.gameId)
        .eq('state', 'deck')
        .order('deck_position', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (deckError) throw new Error(`draw_action_card: deck query failed: ${deckError.message}`)
      if (!topCard) break  // Empty deck — silently skip
      const { error: updateCardError } = await db
        .from('game_action_card_deck')
        .update({ state: 'held', held_by_player_id: context.activatingPlayerId, deck_position: null })
        .eq('id', (topCard as Record<string, string>).id)
      if (updateCardError) throw new Error(`draw_action_card: update failed: ${updateCardError.message}`)
      const { error: updateCountError } = await db
        .from('game_players')
        .update({ action_card_count: ((player.action_card_count as number) ?? 0) + 1 })
        .eq('id', context.activatingPlayerId)
      if (updateCountError) throw new Error(`draw_action_card: count update failed: ${updateCountError.message}`)
      break
    }
    case 'exhaust_planets': {
      // Exhausts all planets for the target player (trait filter requires named handler — see design spec).
      const targetId = op.target === 'chosen_player'
        ? (context.targetPlayerId ?? context.activatingPlayerId)
        : context.activatingPlayerId
      const { error } = await db
        .from('game_player_planets')
        .update({ exhausted: true })
        .eq('game_id', context.gameId)
        .eq('player_id', targetId)
      if (error) throw new Error(`exhaust_planets failed: ${error.message}`)
      break
    }
    case 'choose_one': {
      const options = op.options as unknown[]
      const chosenIndex = context.chosenOption ?? 0
      const chosenOp = options[chosenIndex]
      if (chosenOp) {
        await interpretOp(chosenOp as Record<string, unknown>, context, player, db)
      }
      break
    }
    // These ops are defined in the DSL spec but not yet executable — they depend on
    // game systems (combat, voting, exploration) that will be built in future phases.
    case 'modify_roll':
    case 'add_die':
    case 'cancel_hit':
    case 'cast_votes':
    case 'prevent_vote':
    case 'draw_secret_objective':
    case 'place_units':
    case 'destroy_units':
    case 'explore_planet':
    case 'convert_commodities':
    case 'gain_command_tokens':
    case 'ignore_prerequisite':
    case 'take_from_discard':
    case 'gain_technology':
      break  // No-op until the relevant game system is implemented
    default:
      throw new Error(`Unknown op: ${op.op}`)
  }
}

function resolveAmount(amount: number | string, context: ResolveContext): number {
  if (amount === 'chosen_amount') return context.chosenAmount ?? 0
  return amount as number
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/abilityDsl.test.js
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts ti4-companion-web/tests/lib/abilityDsl.test.js
git commit -m "feat: add DSL interpreter for ability effects"
```

---

## Task 2: Named handler registry — `_shared/abilityHandlers.ts`

**Files:**
- Create: `supabase/functions/_shared/abilityHandlers.ts`

No tests needed for the stub — it is just an extensible registry. Tests will come with each handler implementation.

- [ ] **Step 1: Create the file**

```typescript
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ResolveContext } from './abilityDsl.ts'

type HandlerFn = (context: ResolveContext, db: SupabaseClient) => Promise<void>

/**
 * Registry of named effect handlers for abilities that cannot be expressed
 * as composable DSL ops. Add new handlers here as complex abilities are encoded.
 *
 * Each handler receives the full resolve context and the service-role db client.
 * Throw an Error to signal resolution failure — the caller will return 500.
 */
const handlers: Record<string, HandlerFn> = {
  // Example (add real handlers here as cards are encoded):
  // confounding_legal_text: async (context, db) => { ... },
}

export function getHandler(name: string): HandlerFn {
  const handler = handlers[name]
  if (!handler) throw new Error(`No handler registered for: ${name}`)
  return handler
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/abilityHandlers.ts
git commit -m "feat: add named ability handler registry"
```

---

## Task 3: `game-resolve-ability` Edge Function (TDD)

**Files:**
- Create: `supabase/functions/game-resolve-ability/index.ts`
- Create: `ti4-companion-web/tests/functions/game-resolve-ability.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/functions/game-resolve-ability.test.js`:

```javascript
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

vi.mock('../../../supabase/functions/_shared/abilityDsl.ts', () => ({
  interpretEffects: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../supabase/functions/_shared/abilityHandlers.ts', () => ({
  getHandler: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { getHandler } from '../../../supabase/functions/_shared/abilityHandlers.ts'
import { handler } from '../../../supabase/functions/game-resolve-ability/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const ABILITY_ID = 'ability-uuid'
const PLAYER_ID = 'player-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-resolve-ability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const DSL_ABILITY = {
  id: ABILITY_ID,
  ability_name: 'Test Ability',
  trigger: { event: 'AGENDA_PHASE_START', owner: 'self' },
  effects: [{ op: 'gain_trade_goods', amount: 1 }],
  handler: null,
  exhausts_source: false,
  purges_source: false,
}

const HANDLER_ABILITY = {
  ...DSL_ABILITY,
  effects: null,
  handler: 'some_handler',
}

function mockDb({ player = { id: PLAYER_ID, action_card_count: 0 }, ability = DSL_ABILITY, source = { id: 'source-uuid' } } = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'ability_definitions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: ability, error: null }),
          }),
        }),
      }
    }
    if (table === 'ability_sources') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: source, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_relic_deck' || table === 'game_action_card_deck') {
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    }
    return {}
  })
}

describe('game-resolve-ability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ ability_definition_id: ABILITY_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ability_definition_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when source_type is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when ability not found', async () => {
    mockDb({ ability: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability' }))
    expect(res.status).toBe(404)
  })

  it('returns 200 and calls interpretEffects for a DSL ability', async () => {
    mockDb()
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability', selections: {} }))
    expect(res.status).toBe(200)
    expect(interpretEffects).toHaveBeenCalledOnce()
    expect(getHandler).not.toHaveBeenCalled()
  })

  it('returns 200 and calls the named handler for a handler ability', async () => {
    mockDb({ ability: HANDLER_ABILITY })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'faction_ability', selections: {} }))
    expect(res.status).toBe(200)
    expect(getHandler).toHaveBeenCalledWith('some_handler')
    expect(interpretEffects).not.toHaveBeenCalled()
  })

  it('marks relic as exhausted when exhausts_source is true', async () => {
    const relicUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, action_card_count: 0 }, error: null }) }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'ability_definitions') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { ...DSL_ABILITY, exhausts_source: true }, error: null }) }) }) }
      }
      if (table === 'game_relic_deck') {
        return { update: relicUpdateMock }
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'src' }, error: null }) }) }) }) }) }
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID, source_type: 'relic', source_id: 'relic-deck-uuid', selections: {} }))
    expect(res.status).toBe(200)
    expect(relicUpdateMock).toHaveBeenCalledWith({ state: 'exhausted' })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/functions/game-resolve-ability.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `supabase/functions/game-resolve-ability/index.ts`**

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { interpretEffects, ResolveContext } from '../_shared/abilityDsl.ts'
import { getHandler } from '../_shared/abilityHandlers.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; ability_definition_id?: unknown; source_type?: unknown; source_id?: unknown; selections?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.ability_definition_id || typeof body.ability_definition_id !== 'string') return errorResponse("'ability_definition_id' is required")
  if (!body.source_type || typeof body.source_type !== 'string') return errorResponse("'source_type' is required")

  // 1. Find the activating player
  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, action_card_count')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  // 2. Load the ability definition
  const { data: ability, error: abilityError } = await db
    .from('ability_definitions')
    .select('*')
    .eq('id', body.ability_definition_id)
    .maybeSingle()
  if (abilityError) return errorResponse('Database error', 500)
  if (!ability) return errorResponse('Ability not found', 404)

  // 3. Verify the source (skip for faction abilities — they are implicit)
  if (body.source_type !== 'faction_ability' && body.source_id) {
    const { data: source, error: sourceError } = await db
      .from('ability_sources')
      .select('id')
      .eq('ability_id', body.ability_definition_id)
      .eq('source_type', body.source_type)
      .eq('source_id', body.source_id)
      .maybeSingle()
    if (sourceError) return errorResponse('Database error', 500)
    if (!source) return errorResponse('Ability source not found', 404)
  }

  // 4. Build resolution context
  const selections = ((body.selections ?? {}) as Record<string, unknown>)
  const context: ResolveContext = {
    gameId: body.game_id,
    activatingPlayerId: (player as Record<string, string>).id,
    targetPlayerId: selections.chosen_player as string | undefined,
    targetPlanetName: selections.chosen_planet as string | undefined,
    chosenAmount: selections.chosen_amount as number | undefined,
    chosenOption: selections.chosen_option as number | undefined,
  }

  // 5. Execute
  try {
    if ((ability as Record<string, unknown>).handler) {
      const handlerFn = getHandler((ability as Record<string, string>).handler)
      await handlerFn(context, db)
    } else {
      await interpretEffects((ability as Record<string, unknown[]>).effects, context, db)
    }
  } catch (e: unknown) {
    return errorResponse(`Resolution failed: ${(e as Error).message}`, 500)
  }

  // 6. Apply source side-effects
  const ab = ability as Record<string, unknown>
  if (ab.exhausts_source && body.source_id) {
    if (body.source_type === 'relic') {
      await db.from('game_relic_deck').update({ state: 'exhausted' }).eq('id', body.source_id)
    }
  }

  if (ab.purges_source && body.source_id) {
    if (body.source_type === 'relic') {
      await db.from('game_relic_deck').update({ state: 'purged' }).eq('id', body.source_id)
    } else if (body.source_type === 'action_card') {
      await db.from('game_action_card_deck').update({ state: 'discarded', held_by_player_id: null }).eq('id', body.source_id)
      const p = player as Record<string, number>
      await db.from('game_players').update({ action_card_count: Math.max(0, p.action_card_count - 1) }).eq('id', p.id)
    }
  }

  return okResponse({ resolved: true })
}

Deno.serve(handler)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-resolve-ability.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Deploy**

```bash
supabase functions deploy game-resolve-ability --no-verify-jwt
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-resolve-ability/index.ts ti4-companion-web/tests/functions/game-resolve-ability.test.js
git commit -m "feat: add game-resolve-ability Edge Function"
```

---

## Task 4: `game-unlock-commander` Edge Function (TDD)

**Files:**
- Create: `supabase/functions/game-unlock-commander/index.ts`
- Create: `ti4-companion-web/tests/functions/game-unlock-commander.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/functions/game-unlock-commander.test.js`:

```javascript
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
import { handler } from '../../../supabase/functions/game-unlock-commander/index.ts'

const USER_ID = 'user-uuid'
const GAME_ID = 'game-uuid'
const ABILITY_ID = 'ability-uuid'
const PLAYER_ID = 'player-uuid'
const LEADER_ID = 'leader-uuid'

function makeRequest(body) {
  return new Request('http://localhost/game-unlock-commander', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function mockDb({
  player = { id: PLAYER_ID, vp: 5, technologies: ['a', 'b', 'c'], leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' }, faction: 'Arborec' },
  ability = { id: ABILITY_ID, unlock_conditions: [{ check: 'scored_objectives', gte: 3 }] },
  source = { id: 'src-uuid', source_id: LEADER_ID },
  leader = { id: LEADER_ID, leader_type: 'commander' },
  scoredObjectives = [
    { scored_by: [PLAYER_ID] },
    { scored_by: [PLAYER_ID] },
    { scored_by: [PLAYER_ID] },
  ],
  playerUpdateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: playerUpdateError }) }),
      }
    }
    if (table === 'ability_definitions') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: ability, error: null }) }) }) }
    }
    if (table === 'ability_sources') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: source, error: null }) }) }) }) }
    }
    if (table === 'leaders') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: leader, error: null }) }) }) }
    }
    if (table === 'game_public_objectives') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: scoredObjectives, error: null }) }) }
    }
    if (table === 'game_player_secret_objectives') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
    }
    return {}
  })
}

describe('game-unlock-commander', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('returns 401 when not authenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id is missing', async () => {
    const res = await handler(makeRequest({ ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ability_definition_id is missing', async () => {
    const res = await handler(makeRequest({ game_id: GAME_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 409 when scored_objectives condition is not met', async () => {
    mockDb({ scoredObjectives: [{ scored_by: [PLAYER_ID] }, { scored_by: [PLAYER_ID] }] })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(409)
  })

  it('returns 200 and sets commander to unlocked when conditions are met', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, vp: 5, technologies: ['a', 'b', 'c'], leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' }, faction: 'Arborec' }, error: null }) }) }) }),
          update: updateMock,
        }
      }
      if (table === 'ability_definitions') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: ABILITY_ID, unlock_conditions: [{ check: 'scored_objectives', gte: 3 }] }, error: null }) }) }) }
      if (table === 'ability_sources') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { source_id: LEADER_ID }, error: null }) }) }) }) }
      if (table === 'leaders') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: LEADER_ID, leader_type: 'commander' }, error: null }) }) }) }
      if (table === 'game_public_objectives') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ scored_by: [PLAYER_ID] }, { scored_by: [PLAYER_ID] }, { scored_by: [PLAYER_ID] }], error: null }) }) }
      if (table === 'game_player_secret_objectives') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }
      return {}
    })
    const res = await handler(makeRequest({ game_id: GAME_ID, ability_definition_id: ABILITY_ID }))
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ leaders: { agent: 'unlocked', commander: 'unlocked', hero: 'locked' } })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/functions/game-unlock-commander.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `supabase/functions/game-unlock-commander/index.ts`**

```typescript
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  let userId: string
  try {
    userId = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, 401)
    return errorResponse('Internal server error', 500)
  }

  let body: { game_id?: unknown; ability_definition_id?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.ability_definition_id || typeof body.ability_definition_id !== 'string') return errorResponse("'ability_definition_id' is required")

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id, vp, technologies, leaders, faction')
    .eq('game_id', body.game_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: ability, error: abilityError } = await db
    .from('ability_definitions')
    .select('unlock_conditions')
    .eq('id', body.ability_definition_id)
    .maybeSingle()
  if (abilityError) return errorResponse('Database error', 500)
  if (!ability) return errorResponse('Ability not found', 404)

  const p = player as Record<string, unknown>
  const conditions = ((ability as Record<string, unknown>).unlock_conditions as Record<string, unknown>[]) ?? []

  for (const condition of conditions) {
    const met = await evaluateCondition(condition, p, body.game_id, db)
    if (!met) return errorResponse('Unlock conditions not met', 409)
  }

  const { data: source, error: sourceError } = await db
    .from('ability_sources')
    .select('source_id')
    .eq('ability_id', body.ability_definition_id)
    .eq('source_type', 'leader')
    .maybeSingle()
  if (sourceError) return errorResponse('Database error', 500)
  if (!source) return errorResponse('Leader source not found', 404)

  const { data: leader, error: leaderError } = await db
    .from('leaders')
    .select('leader_type')
    .eq('id', (source as Record<string, string>).source_id)
    .maybeSingle()
  if (leaderError) return errorResponse('Database error', 500)
  if (!leader || (leader as Record<string, string>).leader_type !== 'commander') {
    return errorResponse('Ability source is not a commander', 400)
  }

  const currentLeaders = (p.leaders as Record<string, string>) ?? {}
  const { error: updateError } = await db
    .from('game_players')
    .update({ leaders: { ...currentLeaders, commander: 'unlocked' } })
    .eq('id', p.id as string)
  if (updateError) return errorResponse('Database error', 500)

  return okResponse({ unlocked: true })
}

async function evaluateCondition(
  condition: Record<string, unknown>,
  player: Record<string, unknown>,
  gameId: string,
  db: SupabaseClient
): Promise<boolean> {
  switch (condition.check) {
    case 'scored_objectives': {
      const { data: pubObjs } = await db
        .from('game_public_objectives')
        .select('scored_by')
        .eq('game_id', gameId)
      const pubCount = (pubObjs ?? []).filter(
        (o: Record<string, string[]>) => o.scored_by?.includes(player.id as string)
      ).length
      const { data: secObjs } = await db
        .from('game_player_secret_objectives')
        .select('id')
        .eq('game_id', gameId)
        .eq('player_id', player.id as string)
        .eq('state', 'scored')
      const secCount = (secObjs ?? []).length
      return (pubCount + secCount) >= (condition.gte as number)
    }
    case 'tech_count': {
      const count = ((player.technologies as string[]) ?? []).length
      return count >= (condition.gte as number)
    }
    case 'vp_count': {
      return (player.vp as number) >= (condition.gte as number)
    }
    default:
      return false
  }
}

Deno.serve(handler)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/functions/game-unlock-commander.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Deploy**

```bash
supabase functions deploy game-unlock-commander --no-verify-jwt
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-unlock-commander/index.ts ti4-companion-web/tests/functions/game-unlock-commander.test.js
git commit -m "feat: add game-unlock-commander Edge Function"
```

---

## Task 5: Add edgeFunctions.js wrappers (TDD)

**Files:**
- Modify: `ti4-companion-web/src/lib/edgeFunctions.js`
- Create: `ti4-companion-web/tests/lib/edgeFunctions.phase5b.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/lib/edgeFunctions.phase5b.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { resolveAbility, unlockCommander } from '../../src/lib/edgeFunctions.js'

describe('Phase 5b edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolveAbility calls game-resolve-ability with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { resolved: true }, error: null })
    await resolveAbility('g1', 'ability-uuid', 'faction_ability', null, { chosen_amount: 3 })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-resolve-ability', {
      body: {
        game_id: 'g1',
        ability_definition_id: 'ability-uuid',
        source_type: 'faction_ability',
        source_id: null,
        selections: { chosen_amount: 3 },
      },
    })
  })

  it('unlockCommander calls game-unlock-commander with game_id and ability_definition_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { unlocked: true }, error: null })
    await unlockCommander('g1', 'ability-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-unlock-commander', {
      body: { game_id: 'g1', ability_definition_id: 'ability-uuid' },
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/lib/edgeFunctions.phase5b.test.js
```

Expected: FAIL — `resolveAbility` and `unlockCommander` are not exported.

- [ ] **Step 3: Add wrappers to `src/lib/edgeFunctions.js`**

Add before the final `export { callFunction }` line:

```javascript
export const resolveAbility = (gameId, abilityDefinitionId, sourceType, sourceId, selections = {}) =>
  callFunction('game-resolve-ability', {
    game_id: gameId,
    ability_definition_id: abilityDefinitionId,
    source_type: sourceType,
    source_id: sourceId,
    selections,
  })

export const unlockCommander = (gameId, abilityDefinitionId) =>
  callFunction('game-unlock-commander', {
    game_id: gameId,
    ability_definition_id: abilityDefinitionId,
  })
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/edgeFunctions.phase5b.test.js
```

Expected: PASS.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add ti4-companion-web/src/lib/edgeFunctions.js ti4-companion-web/tests/lib/edgeFunctions.phase5b.test.js
git commit -m "feat: add resolveAbility and unlockCommander edge function wrappers"
```
