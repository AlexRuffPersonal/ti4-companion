# Phase 42 — Relic Card Effects A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 6 "no-cross-system" PoK relic effects: The Obsidian (on-gain draw), Maw of Worlds (agenda phase exhaust + tech), Scepter of Emelpar (exhaust-only), The Prophet's Tears (reactive choice), The Codex (multi-discard pick), and The Crown of Emphidia (full exploration + status-phase Tomb VP).

**Architecture:** Fix `relicEffects.ts` op-name mismatches first. Extend `abilityDsl.ts` with real `explore_planet` and multi-card `take_from_discard`. Add `applyOnGainRelicEffect` triggered by the existing `gain_relic` op via a new `context.gainedRelicName` field. Update `game-use-relic` with phase gates and `use_type` routing for Crown of Emphidia. Build `DiscardBrowserModal` and update `RelicPanel` per relic.

**Tech Stack:** Deno/TypeScript (Edge Functions), React 19, Tailwind CSS 3, Supabase JS v2, Vitest 4, @testing-library/react

---

## File Map

| File | Change |
|---|---|
| `supabase/functions/_shared/relicEffects.ts` | Remove Enigmatic Device; fix op names; add `applyOnGainRelicEffect` |
| `supabase/functions/_shared/abilityDsl.ts` | `ResolveContext.gainedRelicName`; update `gain_relic`; update `take_from_discard`; implement `explore_planet` |
| `supabase/functions/game-use-relic/index.ts` | Update `ACTION_RELICS`; Maw phase gate; Crown of Emphidia `use_type`; Prophet's Tears enriched response |
| `supabase/functions/game-use-relic-fragment/index.ts` | Call `applyOnGainRelicEffect` after `gain_relic` |
| `supabase/functions/game-resolve-exploration-card/index.ts` | Call `applyOnGainRelicEffect` after `gain_relic` cards resolve |
| `src/lib/edgeFunctions.js` | Update `useRelic` signature |
| `src/components/game/DiscardBrowserModal.jsx` | New multi-select discard browser |
| `src/components/game/RelicPanel.jsx` | Per-relic UI updates |
| `tests/functions/game-use-relic.test.js` | New tests; update stale mock |
| `tests/functions/game-use-relic-fragment.test.js` | Add Obsidian/Shard on-gain tests |
| `tests/components/DiscardBrowserModal.test.jsx` | New test file |
| `tests/components/RelicPanel.test.jsx` | New tests per relic |

---

## Task 1: Fix `relicEffects.ts` — remove Enigmatic Device, correct op names, add on-gain helper

**Files:**
- Modify: `supabase/functions/_shared/relicEffects.ts`
- Modify: `tests/functions/game-use-relic.test.js`

- [ ] **Step 1: Update the stale mock in game-use-relic.test.js**

In `tests/functions/game-use-relic.test.js`, replace the `vi.mock('../../../supabase/functions/_shared/relicEffects.ts', ...)` block with the corrected map:

```js
vi.mock('../../../supabase/functions/_shared/relicEffects.ts', () => ({
  RELIC_EFFECTS: {
    'Dominus Orb':           [{ op: 'dominus_orb_move' }],
    'Maw Of Worlds':         [{ op: 'exhaust_planets' }, { op: 'gain_technology', count: 1 }],
    'Stellar Converter':     [{ op: 'stellar_converter' }],
    'The Codex':             [{ op: 'take_from_discard', deck: 'action_card', count: 3 }],
    'Scepter Of Emelpar':    [],
    "The Prophet's Tears":   [{ op: 'choose_one', options: [[{ op: 'ignore_prerequisite' }], [{ op: 'draw_action_card', count: 1 }]] }],
    'The Crown Of Emphidia': [{ op: 'explore_planet', target: 'any_controlled' }],
    'The Crown Of Thalnos':  [{ op: 'reroll_combat_dice' }],
    'The Obsidian':          [],
    'Shard Of The Throne':   [],
  },
  applyOnGainRelicEffect: vi.fn().mockResolvedValue(undefined),
}))
```

Also update the import line to include `applyOnGainRelicEffect`:
```js
import { RELIC_EFFECTS, applyOnGainRelicEffect } from '../../../supabase/functions/_shared/relicEffects.ts'
```

- [ ] **Step 2: Update the "Enigmatic Device" test to expect 409 'Unknown relic'**

Find the test `it('applies gain_technology for Enigmatic Device with resource spend', ...)` and replace it:

```js
it('409 Unknown relic for Enigmatic Device (removed from effects map)', async () => {
  mockDb({
    relicDef: { ...BASE_RELIC_DEF, name: 'Enigmatic Device', purge_on_use: true, exhaustable: false },
  })
  const res = await handler(makeRequest(baseBody()))
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.error).toMatch(/Unknown relic/i)
})
```

Also find the test `it("applies choice branch for Prophet's Tears with choice=0", ...)` and update the op check from `'choice'` to `'choose_one'`:

```js
it("applies choose_one branch for Prophet's Tears with choice=0", async () => {
  mockDb({
    relicDef: { ...BASE_RELIC_DEF, name: "The Prophet's Tears", purge_on_use: false, exhaustable: true },
  })
  const res = await handler(makeRequest(baseBody({ choice: 0 })))
  expect(res.status).toBe(200)
  expect(applyAbility).toHaveBeenCalled()
  const [ops, context] = applyAbility.mock.calls[0]
  expect(ops[0].op).toBe('choose_one')
  expect(context.chosenOption).toBe(0)
})
```

- [ ] **Step 3: Run existing tests to confirm what currently fails**

```bash
cd ti4-companion-web
npx vitest run tests/functions/game-use-relic.test.js
```

Expected: several tests fail (stale mock assertions).

- [ ] **Step 4: Update `relicEffects.ts`**

Replace the entire contents of `supabase/functions/_shared/relicEffects.ts`:

```typescript
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { applyAbility } from './abilityDsl.ts'
import type { ResolveContext } from './abilityDsl.ts'

export type Op = Record<string, unknown>

export const RELIC_EFFECTS: Record<string, Op[]> = {
  // ACTION relics (active player gate enforced in game-use-relic)
  'Stellar Converter':     [{ op: 'stellar_converter' }],
  'The Codex':             [{ op: 'take_from_discard', deck: 'action_card', count: 3 }],

  // Agenda phase relic
  'Maw Of Worlds':         [{ op: 'exhaust_planets' }, { op: 'gain_technology', count: 1 }],

  // Reactive exhausts
  'Scepter Of Emelpar':    [],
  "The Prophet's Tears":   [{ op: 'choose_one', options: [[{ op: 'ignore_prerequisite' }], [{ op: 'draw_action_card', count: 1 }]] }],
  'The Crown Of Emphidia': [{ op: 'explore_planet', target: 'any_controlled' }],

  // Phase B stubs
  'Dominus Orb':           [{ op: 'dominus_orb_move' }],
  'The Crown Of Thalnos':  [{ op: 'reroll_combat_dice' }],

  // On-gain only (no active use)
  'The Obsidian':          [],
  'Shard Of The Throne':   [],
}

export async function applyOnGainRelicEffect(
  relicName: string,
  gameId: string,
  playerId: string,
  db: SupabaseClient
): Promise<void> {
  const ctx: ResolveContext = { gameId, activatingPlayerId: playerId }

  if (relicName === 'The Obsidian') {
    await applyAbility([{ op: 'draw_secret_objective' }], ctx, db)
  }

  if (relicName === 'Shard Of The Throne') {
    const { data: player, error } = await db
      .from('game_players')
      .select('vp')
      .eq('id', playerId)
      .maybeSingle()
    if (error || !player) throw new Error('applyOnGainRelicEffect: failed to load player')
    const { error: updateError } = await db
      .from('game_players')
      .update({ vp: ((player as { vp: number }).vp ?? 0) + 1 })
      .eq('id', playerId)
    if (updateError) throw new Error(`applyOnGainRelicEffect: VP update failed: ${updateError.message}`)
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/functions/game-use-relic.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/relicEffects.ts tests/functions/game-use-relic.test.js
git commit -m "feat: fix relicEffects op names, remove Enigmatic Device, add applyOnGainRelicEffect"
```

---

## Task 2: Update `abilityDsl.ts` — `gainedRelicName` context field + gain_relic op + take_from_discard multi-select

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`

- [ ] **Step 1: Add `gainedRelicName` to `ResolveContext` interface**

In `supabase/functions/_shared/abilityDsl.ts`, find the `ResolveContext` interface and add the field:

```typescript
export interface ResolveContext {
  gameId: string
  activatingPlayerId: string
  targetPlayerId?: string
  targetPlanetName?: string
  chosenAmount?: number
  chosenOption?: number
  selections?: Record<string, unknown>
  ignorePrerequisite?: boolean
  gainedRelicName?: string          // set by gain_relic op after drawing
}
```

- [ ] **Step 2: Write failing tests for `gain_relic` setting `gainedRelicName`**

Create `tests/lib/abilityDsl-relic.test.js` (a new focused test file for Phase 42 DSL additions):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { db } from '../../../supabase/functions/_shared/db.ts'
import { interpretEffects } from '../../../supabase/functions/_shared/abilityDsl.ts'

const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const RELIC_ROW_ID = 'relic-row-1'
const RELIC_DEF_ID = 'relic-def-1'

function baseContext(overrides = {}) {
  return { gameId: GAME_ID, activatingPlayerId: PLAYER_ID, ...overrides }
}

function mockPlayerRow(overrides = {}) {
  return {
    id: PLAYER_ID, trade_goods: 3, commodities: 2, vp: 0,
    technologies: [], action_card_count: 2,
    command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 },
    faction: 'Arborec',
    ...overrides,
  }
}

describe('abilityDsl — gain_relic sets gainedRelicName', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets context.gainedRelicName to the drawn relic name', async () => {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: mockPlayerRow(), error: null }) }) }) }
      }
      if (table === 'game_relic_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: RELIC_ROW_ID, relic_id: RELIC_DEF_ID }, error: null }) }) }) }) }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'relics') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'The Obsidian' }, error: null }) }) }) }
      }
      return { select: vi.fn(), update: vi.fn() }
    })

    const context = baseContext()
    await interpretEffects([{ op: 'gain_relic' }], context, db)
    expect(context.gainedRelicName).toBe('The Obsidian')
  })

  it('leaves gainedRelicName undefined when deck is empty', async () => {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: mockPlayerRow(), error: null }) }) }) }
      }
      if (table === 'game_relic_deck') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }),
          }),
        }
      }
      return { select: vi.fn() }
    })

    const context = baseContext()
    await interpretEffects([{ op: 'gain_relic' }], context, db)
    expect(context.gainedRelicName).toBeUndefined()
  })
})

describe('abilityDsl — take_from_discard multi-select', () => {
  beforeEach(() => vi.clearAllMocks())

  it('takes multiple cards by card_ids array, increments count by array length', async () => {
    const CARD_1 = 'card-1'
    const CARD_2 = 'card-2'
    let updateCallCount = 0

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: mockPlayerRow({ action_card_count: 1 }), error: null }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_action_card_deck') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: updateCallCount === 0 ? CARD_1 : CARD_2 }, error: null }) }) }) }) }),
          update: vi.fn().mockImplementation(() => { updateCallCount++; return { eq: vi.fn().mockResolvedValue({ error: null }) } }),
        }
      }
      return { select: vi.fn(), update: vi.fn() }
    })

    const context = baseContext({ selections: { card_ids: [CARD_1, CARD_2] } })
    await interpretEffects([{ op: 'take_from_discard', deck: 'action_card', count: 3 }], context, db)
    expect(updateCallCount).toBeGreaterThanOrEqual(2)
  })

  it('409 if a card_id is not in discard for this game', async () => {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: mockPlayerRow(), error: null }) }) }) }
      }
      if (table === 'game_action_card_deck') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }) }
      }
      return { select: vi.fn() }
    })

    const context = baseContext({ selections: { card_ids: ['bad-id'] } })
    await expect(interpretEffects([{ op: 'take_from_discard', deck: 'action_card', count: 3 }], context, db))
      .rejects.toThrow(/Card not found in discard/i)
  })
})

describe('abilityDsl — explore_planet op', () => {
  beforeEach(() => vi.clearAllMocks())

  it('409 if planet_name missing from selections', async () => {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: mockPlayerRow(), error: null }) }) }) }
      }
      return { select: vi.fn() }
    })

    const context = baseContext({ selections: {} })
    await expect(interpretEffects([{ op: 'explore_planet', target: 'any_controlled' }], context, db))
      .rejects.toThrow(/planet_name is required/i)
  })

  it('409 if player does not control planet', async () => {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: mockPlayerRow(), error: null }) }) }) }
      }
      if (table === 'game_player_planets') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }) }
      }
      return { select: vi.fn() }
    })

    const context = baseContext({ selections: { planet_name: 'Mecatol Rex', deck_type: 'cultural' } })
    await expect(interpretEffects([{ op: 'explore_planet', target: 'any_controlled' }], context, db))
      .rejects.toThrow(/not controlled/i)
  })

  it('409 if exploration deck is empty', async () => {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: mockPlayerRow(), error: null }) }) }) }
      }
      if (table === 'game_player_planets') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'planet-row-1' }, error: null }) }) }) }) }) }
      }
      if (table === 'game_exploration_decks') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }) }) }) }
      }
      return { select: vi.fn() }
    })

    const context = baseContext({ selections: { planet_name: 'Mecatol Rex', deck_type: 'cultural' } })
    await expect(interpretEffects([{ op: 'explore_planet', target: 'any_controlled' }], context, db))
      .rejects.toThrow(/deck is empty/i)
  })

  it('draws top card, marks resolved, sets drawnExplorationCard on context', async () => {
    const CARD = { id: 'exp-card-1', name: 'Mercenary Outfit', text: 'Place 1 Infantry...', has_attachment: false, relic_fragment_type: null, state: 'deck', deck_position: 1 }

    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: mockPlayerRow(), error: null }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'game_player_planets') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'planet-row-1' }, error: null }) }) }) }) }) }
      }
      if (table === 'game_exploration_decks') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: CARD, error: null }) }) }) }) }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'game_player_units') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }) }), insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return { select: vi.fn(), update: vi.fn(), insert: vi.fn() }
    })

    const context = baseContext({ selections: { planet_name: 'Mecatol Rex', deck_type: 'cultural' } })
    await interpretEffects([{ op: 'explore_planet', target: 'any_controlled' }], context, db)
    expect((context as Record<string, unknown>).drawnExplorationCard).toMatchObject({ name: 'Mercenary Outfit' })
  })
})
```

- [ ] **Step 3: Run to verify tests fail**

```bash
npx vitest run tests/lib/abilityDsl-relic.test.js
```

Expected: all tests fail (features not yet implemented).

- [ ] **Step 4: Update `gain_relic` op in `abilityDsl.ts` to set `gainedRelicName`**

In `supabase/functions/_shared/abilityDsl.ts`, find `case 'gain_relic':`. After the update that sets `held_by_player_id`, add a relic name fetch:

```typescript
case 'gain_relic': {
  const { data: topRelic, error: deckError } = await db
    .from('game_relic_deck')
    .select('id, relic_id')
    .eq('game_id', context.gameId)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (deckError) throw new Error(`gain_relic: deck query failed: ${deckError.message}`)
  if (!topRelic) break  // Empty relic deck — silently skip
  const { error: updateError } = await db
    .from('game_relic_deck')
    .update({ state: 'held', held_by_player_id: context.activatingPlayerId, deck_position: null })
    .eq('id', (topRelic as Record<string, string>).id)
  if (updateError) throw new Error(`gain_relic: update failed: ${updateError.message}`)
  // Fetch relic name so callers can trigger on-gain effects
  const { data: relicDef } = await db
    .from('relics')
    .select('name')
    .eq('id', (topRelic as Record<string, string>).relic_id)
    .maybeSingle()
  if (relicDef) context.gainedRelicName = (relicDef as { name: string }).name
  break
}
```

- [ ] **Step 5: Update `take_from_discard` op to support `card_ids` array**

Find `case 'take_from_discard':` and replace with:

```typescript
case 'take_from_discard': {
  const selObj = context.selections as Record<string, unknown>
  const rawIds = selObj?.card_ids as string[] | undefined
  const cardIds: string[] = rawIds ?? (selObj?.card_id ? [selObj.card_id as string] : [])
  if (cardIds.length === 0) throw dslError('card_id or card_ids is required in selections')
  const maxCount = (op.count as number) ?? 1
  const idsToTake = cardIds.slice(0, maxCount)

  for (const cardId of idsToTake) {
    const { data: card, error: findError } = await db.from('game_action_card_deck')
      .select('id')
      .eq('id', cardId)
      .eq('game_id', context.gameId)
      .eq('state', 'discard')
      .maybeSingle()
    if (findError) throw new Error(`take_from_discard: query failed: ${findError.message}`)
    if (!card) throw dslError('Card not found in discard')
    const { error } = await db.from('game_action_card_deck')
      .update({ state: 'held', held_by_player_id: context.activatingPlayerId, deck_position: null })
      .eq('id', cardId)
    if (error) throw new Error(`take_from_discard: update failed: ${error.message}`)
  }

  const { error: countError } = await db.from('game_players')
    .update({ action_card_count: (player.action_card_count as number ?? 0) + idsToTake.length })
    .eq('id', context.activatingPlayerId)
  if (countError) throw new Error(`take_from_discard: count update failed: ${countError.message}`)
  break
}
```

- [ ] **Step 6: Implement `explore_planet` op**

Find `case 'explore_planet':` (currently just `break`) and replace with:

```typescript
case 'explore_planet': {
  const sel = context.selections as Record<string, unknown>
  const planetName = sel?.planet_name as string
  const deckType = sel?.deck_type as string
  if (!planetName) throw dslError('planet_name is required for explore_planet')
  if (!deckType) throw dslError('deck_type is required for explore_planet')

  // Validate player controls this planet
  const { data: planetRow, error: planetError } = await db.from('game_player_planets')
    .select('id')
    .eq('game_id', context.gameId)
    .eq('player_id', context.activatingPlayerId)
    .eq('planet_name', planetName)
    .maybeSingle()
  if (planetError) throw new Error(`explore_planet: planet query failed: ${planetError.message}`)
  if (!planetRow) throw dslError('Planet not controlled by player')

  // Draw top exploration card
  const { data: topCard, error: deckError } = await db.from('game_exploration_decks')
    .select('id, name, text, has_attachment, relic_fragment_type, state, deck_position')
    .eq('game_id', context.gameId)
    .eq('deck_type', deckType)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (deckError) throw new Error(`explore_planet: deck query failed: ${deckError.message}`)
  if (!topCard) throw dslError('Exploration deck is empty')

  // Mark as resolved
  const { error: resolveError } = await db.from('game_exploration_decks')
    .update({ state: 'resolved', resolved_by_player_id: context.activatingPlayerId })
    .eq('id', (topCard as Record<string, string>).id)
  if (resolveError) throw new Error(`explore_planet: resolve failed: ${resolveError.message}`)

  // Apply the card's effects inline using the EXPLORATION_EFFECTS map
  const { EXPLORATION_EFFECTS } = await import('./explorationEffects.ts')
  const cardEffects = EXPLORATION_EFFECTS[(topCard as Record<string, string>).name]
  if (cardEffects && cardEffects.length > 0) {
    await interpretEffects(cardEffects, context, db)
  }

  // Expose drawn card for callers to include in response
  ;(context as Record<string, unknown>).drawnExplorationCard = topCard
  break
}
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run tests/lib/abilityDsl-relic.test.js
```

Expected: all pass.

- [ ] **Step 8: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: all existing tests still pass.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts tests/lib/abilityDsl-relic.test.js
git commit -m "feat: extend abilityDsl — gainedRelicName context, multi-card take_from_discard, real explore_planet op"
```

---

## Task 3: Update `game-use-relic` — phase gates, Crown of Emphidia routing, Prophet's Tears response

**Files:**
- Modify: `supabase/functions/game-use-relic/index.ts`
- Modify: `tests/functions/game-use-relic.test.js`

- [ ] **Step 1: Write new failing tests**

Add to `tests/functions/game-use-relic.test.js`:

```js
it('409 Not agenda phase for Maw Of Worlds when phase is action', async () => {
  mockDb({
    game: { phase: 'action', active_player_id: PLAYER_ID },
    relicDef: { ...BASE_RELIC_DEF, name: 'Maw Of Worlds', purge_on_use: true, exhaustable: false },
  })
  const res = await handler(makeRequest(baseBody()))
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.error).toMatch(/Not agenda phase/i)
})

it('200 Maw Of Worlds succeeds when phase is agenda', async () => {
  mockDb({
    game: { phase: 'agenda', active_player_id: PLAYER_ID },
    relicDef: { ...BASE_RELIC_DEF, name: 'Maw Of Worlds', purge_on_use: true, exhaustable: false },
  })
  const res = await handler(makeRequest(baseBody({ technology_name: 'Neural Motivator' })))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.applied).toBe('Maw Of Worlds')
})

it("Prophet's Tears choice=0 returns effect: ignore_prerequisite in response", async () => {
  mockDb({
    relicDef: { ...BASE_RELIC_DEF, name: "The Prophet's Tears", purge_on_use: false, exhaustable: true },
  })
  const res = await handler(makeRequest(baseBody({ choice: 0 })))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.effect).toBe('ignore_prerequisite')
})

it("Prophet's Tears choice=1 returns effect: draw_action_card in response", async () => {
  mockDb({
    relicDef: { ...BASE_RELIC_DEF, name: "The Prophet's Tears", purge_on_use: false, exhaustable: true },
  })
  const res = await handler(makeRequest(baseBody({ choice: 1 })))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.effect).toBe('draw_action_card')
})

it('Crown of Emphidia purge_for_vp 409 when phase is not status', async () => {
  mockDb({
    game: { phase: 'action', active_player_id: PLAYER_ID },
    relicDef: { ...BASE_RELIC_DEF, name: 'The Crown Of Emphidia', purge_on_use: true, exhaustable: true },
  })
  const res = await handler(makeRequest(baseBody({ use_type: 'purge_for_vp' })))
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.error).toMatch(/Not status phase/i)
})

it('Crown of Emphidia purge_for_vp 409 when Tomb not controlled', async () => {
  mockDb({
    game: { phase: 'status', active_player_id: PLAYER_ID },
    relicDef: { ...BASE_RELIC_DEF, name: 'The Crown Of Emphidia', purge_on_use: true, exhaustable: true },
    tombRow: null,
  })
  const res = await handler(makeRequest(baseBody({ use_type: 'purge_for_vp' })))
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.error).toMatch(/Tomb of Emphidia not controlled/i)
})

it('Crown of Emphidia purge_for_vp awards VP and purges card when Tomb controlled', async () => {
  mockDb({
    game: { phase: 'status', active_player_id: PLAYER_ID },
    relicDef: { ...BASE_RELIC_DEF, name: 'The Crown Of Emphidia', purge_on_use: true, exhaustable: true },
    tombRow: { id: 'tomb-row-1' },
    playerVp: 2,
  })
  const res = await handler(makeRequest(baseBody({ use_type: 'purge_for_vp' })))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.effect).toBe('purge_for_vp')
})
```

You also need to extend `mockDb` to handle the new table queries. Add `tombRow` and `playerVp` parameters and handle the `game_player_planets` and `game_players` update queries for the Tomb check:

```js
function mockDb({
  // ... existing params ...
  tombRow = undefined,   // { id: 'tomb-row-1' } or null
  playerVp = 0,
} = {}) {
  db.from.mockImplementation((table) => {
    // ... existing handlers ...

    if (table === 'game_player_planets' && tombRow !== undefined) {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: tombRow, error: null }),
              }),
            }),
          }),
        }),
      }
    }

    // For game_players VP update
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }

    // ... rest of existing handlers ...
  })
}
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/functions/game-use-relic.test.js
```

Expected: new tests fail.

- [ ] **Step 3: Update `game-use-relic/index.ts`**

In `supabase/functions/game-use-relic/index.ts`:

1. Update `ACTION_RELICS` constant:
```typescript
const ACTION_RELICS = ['Stellar Converter', 'The Codex']
```

2. Add `use_type` to body parsing (after existing optional fields):
```typescript
const useType = typeof body.use_type === 'string' ? body.use_type : null
const cardIds = Array.isArray(body.card_ids) ? body.card_ids as string[] : null
const technologyName = typeof body.technology_name === 'string' ? body.technology_name : null
```

3. After the active player check, add Maw Of Worlds phase gate:
```typescript
if (def.name === 'Maw Of Worlds' && gameRow.phase !== 'agenda') {
  return errorResponse('Not agenda phase', 409)
}
```

4. Before `applyAbility`, add Crown of Emphidia `purge_for_vp` path:
```typescript
if (def.name === 'The Crown Of Emphidia' && useType === 'purge_for_vp') {
  if (gameRow.phase !== 'status') return errorResponse('Not status phase', 409)
  const { data: tombRow, error: tombError } = await db
    .from('game_player_planets')
    .select('id')
    .eq('game_id', gameId)
    .eq('player_id', playerRow.id)
    .eq('planet_name', 'Tomb of Emphidia')
    .maybeSingle()
  if (tombError) return errorResponse('Database error', 500)
  if (!tombRow) return errorResponse('Tomb of Emphidia not controlled', 409)
  const { data: playerVpRow } = await db.from('game_players').select('vp').eq('id', playerRow.id).maybeSingle()
  await db.from('game_players').update({ vp: ((playerVpRow as { vp: number } | null)?.vp ?? 0) + 1 }).eq('id', playerRow.id)
  await db.from('game_relic_deck').update({ state: 'purged' }).eq('id', relicId)
  return okResponse({ applied: def.name, effect: 'purge_for_vp' })
}
```

5. Update `context` to include `selections`:
```typescript
const context = {
  gameId,
  activatingPlayerId: playerRow.id,
  chosenOption: choice ?? undefined,
  relicId,
  phase: gameRow.phase,
  selections: {
    planet_name: planetName ?? undefined,
    deck_type: typeof body.deck_type === 'string' ? body.deck_type : undefined,
    card_ids: cardIds ?? undefined,
    technology_name: technologyName ?? undefined,
  },
}
```

6. After `applyAbility`, add Prophet's Tears enriched response logic:
```typescript
let effectLabel: string | undefined
if (def.name === "The Prophet's Tears") {
  effectLabel = choice === 0 ? 'ignore_prerequisite' : 'draw_action_card'
}
```

7. Update the final `okResponse` to include `effect`:
```typescript
return okResponse({ applied: def.name, ...(effectLabel ? { effect: effectLabel } : {}) })
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/functions/game-use-relic.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-use-relic/index.ts tests/functions/game-use-relic.test.js
git commit -m "feat: game-use-relic — Maw phase gate, Crown of Emphidia use_type routing, Prophet's Tears effect response"
```

---

## Task 4: Add on-gain relic hook to `game-use-relic-fragment` and `game-resolve-exploration-card`

**Files:**
- Modify: `supabase/functions/game-use-relic-fragment/index.ts`
- Modify: `supabase/functions/game-resolve-exploration-card/index.ts`
- Modify: `tests/functions/game-use-relic-fragment.test.js`

- [ ] **Step 1: Write failing tests for the on-gain hook in `game-use-relic-fragment`**

Add to `tests/functions/game-use-relic-fragment.test.js`:

```js
// Add to the vi.mock for relicEffects.ts
vi.mock('../../../supabase/functions/_shared/relicEffects.ts', () => ({
  applyOnGainRelicEffect: vi.fn().mockResolvedValue(undefined),
}))

import { applyOnGainRelicEffect } from '../../../supabase/functions/_shared/relicEffects.ts'
```

Then update `beforeEach` to clear `applyOnGainRelicEffect`:
```js
beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  requireAuth.mockResolvedValue(USER_ID)
  applyAbility.mockResolvedValue(undefined)
  applyOnGainRelicEffect.mockResolvedValue(undefined)
})
```

Add a helper to simulate the gain_relic op setting `gainedRelicName` on context:
```js
// Make applyAbility simulate setting gainedRelicName on context
function mockApplyAbilityWithGainedRelic(relicName) {
  applyAbility.mockImplementation(async (ops, context) => {
    context.gainedRelicName = relicName
  })
}
```

Add tests:
```js
it('calls applyOnGainRelicEffect with The Obsidian after gaining relic', async () => {
  mockApplyAbilityWithGainedRelic('The Obsidian')
  const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
  expect(res.status).toBe(200)
  expect(applyOnGainRelicEffect).toHaveBeenCalledWith('The Obsidian', GAME_ID, PLAYER_ID, expect.anything())
})

it('calls applyOnGainRelicEffect with Shard Of The Throne after gaining relic', async () => {
  mockApplyAbilityWithGainedRelic('Shard Of The Throne')
  const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
  expect(res.status).toBe(200)
  expect(applyOnGainRelicEffect).toHaveBeenCalledWith('Shard Of The Throne', GAME_ID, PLAYER_ID, expect.anything())
})

it('does not call applyOnGainRelicEffect when no relic was gained (empty deck)', async () => {
  applyAbility.mockResolvedValue(undefined)  // gainedRelicName stays undefined
  const res = await handler(makeRequest({ game_id: GAME_ID, fragment_ids: BASE_FRAGMENT_IDS }))
  expect(res.status).toBe(200)
  expect(applyOnGainRelicEffect).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/functions/game-use-relic-fragment.test.js
```

Expected: new tests fail.

- [ ] **Step 3: Update `game-use-relic-fragment/index.ts`**

Add import at the top:
```typescript
import { applyOnGainRelicEffect } from '../_shared/relicEffects.ts'
```

After the existing `await applyAbility([{ op: 'gain_relic' }], context, db)` call, add:
```typescript
if (context.gainedRelicName) {
  await applyOnGainRelicEffect(context.gainedRelicName, game_id, player.id, db)
}
```

Where `player.id` is the existing player row's id field. The exact variable name depends on what the function calls it — find the player query result and use its `id` field.

- [ ] **Step 4: Update `game-resolve-exploration-card/index.ts` the same way**

Add import:
```typescript
import { applyOnGainRelicEffect } from '../_shared/relicEffects.ts'
```

Find where `applyAbility` is called. After it resolves, add:
```typescript
if (context.gainedRelicName) {
  await applyOnGainRelicEffect(context.gainedRelicName, gameId, playerId, db)
}
```

(Use the actual variable names from that function.)

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/functions/game-use-relic-fragment.test.js
```

Expected: all pass.

- [ ] **Step 6: Run full suite**

```bash
npx vitest run
```

Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/game-use-relic-fragment/index.ts supabase/functions/game-resolve-exploration-card/index.ts tests/functions/game-use-relic-fragment.test.js
git commit -m "feat: trigger applyOnGainRelicEffect in relic-fragment and exploration-card gain flows"
```

---

## Task 5: Update `edgeFunctions.js` — `useRelic` extended signature

**Files:**
- Modify: `src/lib/edgeFunctions.js`

- [ ] **Step 1: Find the existing `useRelic` export**

```bash
grep -n "useRelic" ti4-companion-web/src/lib/edgeFunctions.js
```

- [ ] **Step 2: Replace with the extended signature**

Replace the existing `useRelic` export with:

```js
export const useRelic = (gameId, playerId, relicId, opts = {}) =>
  callFunction('game-use-relic', {
    game_id: gameId,
    player_id: playerId,
    relic_id: relicId,
    choice: opts.choice,
    use_type: opts.useType,
    planet_name: opts.planetName,
    deck_type: opts.deckType,
    card_ids: opts.cardIds,
    technology_name: opts.technologyName,
  })
```

- [ ] **Step 3: Run full test suite**

```bash
cd ti4-companion-web && npx vitest run
```

Expected: all pass (edgeFunctions is simple, no unit tests needed for the signature change).

- [ ] **Step 4: Commit**

```bash
git add src/lib/edgeFunctions.js
git commit -m "feat: extend useRelic client wrapper with opts for choice, use_type, planet selection, card_ids"
```

---

## Task 6: Build `DiscardBrowserModal.jsx`

**Files:**
- Create: `src/components/game/DiscardBrowserModal.jsx`
- Create: `tests/components/DiscardBrowserModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/DiscardBrowserModal.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DiscardBrowserModal from '../../src/components/game/DiscardBrowserModal.jsx'

const CARDS = [
  { id: 'card-1', name: 'Shrapnel Turrets', text: 'After a round of space combat...' },
  { id: 'card-2', name: 'Blitz', text: 'After you commit ground forces...' },
  { id: 'card-3', name: 'Parley', text: 'After another player moves ships...' },
  { id: 'card-4', name: 'Signal Jamming', text: 'When another player activates a system...' },
]

describe('DiscardBrowserModal', () => {
  it('renders null when open=false', () => {
    const { container } = render(
      <DiscardBrowserModal open={false} cards={CARDS} maxSelect={3} onConfirm={vi.fn()} onClose={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders all card names when open', () => {
    render(<DiscardBrowserModal open cards={CARDS} maxSelect={3} onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Shrapnel Turrets')).toBeTruthy()
    expect(screen.getByText('Blitz')).toBeTruthy()
    expect(screen.getByText('Parley')).toBeTruthy()
  })

  it('Confirm button is disabled when nothing selected', () => {
    render(<DiscardBrowserModal open cards={CARDS} maxSelect={3} onConfirm={vi.fn()} onClose={vi.fn()} />)
    const confirm = screen.getByRole('button', { name: /take selected/i })
    expect(confirm.disabled).toBe(true)
  })

  it('Confirm button enables after selecting a card', () => {
    render(<DiscardBrowserModal open cards={CARDS} maxSelect={3} onConfirm={vi.fn()} onClose={vi.fn()} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    const confirm = screen.getByRole('button', { name: /take selected/i })
    expect(confirm.disabled).toBe(false)
  })

  it('calls onConfirm with selected card ids', () => {
    const onConfirm = vi.fn()
    render(<DiscardBrowserModal open cards={CARDS} maxSelect={3} onConfirm={onConfirm} onClose={vi.fn()} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])
    fireEvent.click(screen.getByRole('button', { name: /take selected/i }))
    expect(onConfirm).toHaveBeenCalledWith(['card-1', 'card-2'])
  })

  it('disables unselected checkboxes when maxSelect reached', () => {
    render(<DiscardBrowserModal open cards={CARDS} maxSelect={2} onConfirm={vi.fn()} onClose={vi.fn()} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])
    expect(checkboxes[2].disabled).toBe(true)
    expect(checkboxes[3].disabled).toBe(true)
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<DiscardBrowserModal open cards={CARDS} maxSelect={3} onConfirm={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/components/DiscardBrowserModal.test.jsx
```

Expected: fail (component does not exist).

- [ ] **Step 3: Create `DiscardBrowserModal.jsx`**

Create `src/components/game/DiscardBrowserModal.jsx`:

```jsx
import { useState } from 'react'

export default function DiscardBrowserModal({ open, cards, maxSelect = 3, onConfirm, onClose }) {
  const [selectedIds, setSelectedIds] = useState([])

  if (!open) return null

  function toggle(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <p className="label">Choose up to {maxSelect} Action Cards</p>

        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {cards.map(card => {
            const isSelected = selectedIds.includes(card.id)
            const isDisabled = !isSelected && selectedIds.length >= maxSelect
            return (
              <label
                key={card.id}
                className={`flex items-start gap-3 p-2 rounded cursor-pointer panel-inset ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => toggle(card.id)}
                  className="mt-1"
                />
                <div>
                  <p className="font-bold text-bright text-sm">{card.name}</p>
                  <p className="text-muted text-xs">{card.text}</p>
                </div>
              </label>
            )
          })}
        </div>

        <div className="flex gap-2 justify-end">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={selectedIds.length === 0}
            onClick={() => onConfirm(selectedIds)}
          >
            Take Selected ({selectedIds.length})
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/components/DiscardBrowserModal.test.jsx
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/DiscardBrowserModal.jsx tests/components/DiscardBrowserModal.test.jsx
git commit -m "feat: add DiscardBrowserModal for multi-select action card discard browsing (The Codex)"
```

---

## Task 7: Update `RelicPanel.jsx` — per-relic UI

**Files:**
- Modify: `src/components/game/RelicPanel.jsx`
- Modify: `tests/components/RelicPanel.test.jsx` (or create if missing)

- [ ] **Step 1: Read the current RelicPanel**

```bash
cat ti4-companion-web/src/components/game/RelicPanel.jsx
```

- [ ] **Step 2: Write failing tests**

Check if `tests/components/RelicPanel.test.jsx` exists:

```bash
ls ti4-companion-web/tests/components/RelicPanel.test.jsx 2>/dev/null || echo "not found"
```

If it exists, add to it. If not, create it. Add these tests:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RelicPanel from '../../src/components/game/RelicPanel.jsx'

function makeRelic(overrides = {}) {
  return {
    id: 'relic-row-1',
    name: 'Shard Of The Throne',
    text: 'When you gain this card, gain 1 victory point...',
    exhausted: false,
    state: 'active',
    exhaustable: false,
    purge_on_use: false,
    ...overrides,
  }
}

describe('RelicPanel — Phase 42 relic UIs', () => {
  it('renders passive badge for The Obsidian', () => {
    const relic = makeRelic({ name: 'The Obsidian', text: 'When you gain this card, draw 1 secret objective.' })
    render(<RelicPanel relics={[relic]} isActivePlayer phase="action" onUseRelic={vi.fn()} controlledPlanets={[]} discardedActionCards={[]} />)
    expect(screen.getByText(/\+1 secret objective limit/i)).toBeTruthy()
  })

  it('renders passive badge for Shard Of The Throne', () => {
    const relic = makeRelic({ name: 'Shard Of The Throne' })
    render(<RelicPanel relics={[relic]} isActivePlayer phase="action" onUseRelic={vi.fn()} controlledPlanets={[]} discardedActionCards={[]} />)
    expect(screen.getByText(/1 VP \(while held\)/i)).toBeTruthy()
  })

  it('Maw Of Worlds button disabled outside agenda phase', () => {
    const relic = makeRelic({ name: 'Maw Of Worlds', purge_on_use: true })
    render(<RelicPanel relics={[relic]} isActivePlayer phase="action" onUseRelic={vi.fn()} controlledPlanets={[]} discardedActionCards={[]} />)
    expect(screen.getByRole('button', { name: /agenda phase/i }).disabled).toBe(true)
  })

  it('Maw Of Worlds button enabled in agenda phase', () => {
    const relic = makeRelic({ name: 'Maw Of Worlds', purge_on_use: true })
    render(<RelicPanel relics={[relic]} isActivePlayer={true} phase="agenda" onUseRelic={vi.fn()} controlledPlanets={[]} discardedActionCards={[]} />)
    expect(screen.getByRole('button', { name: /agenda phase/i }).disabled).toBe(false)
  })

  it("Prophet's Tears shows choice UI on click", () => {
    const relic = makeRelic({ name: "The Prophet's Tears", exhaustable: true })
    render(<RelicPanel relics={[relic]} isActivePlayer phase="action" onUseRelic={vi.fn()} controlledPlanets={[]} discardedActionCards={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /exhaust/i }))
    expect(screen.getByText(/ignore prerequisite/i)).toBeTruthy()
    expect(screen.getByText(/draw action card/i)).toBeTruthy()
  })

  it("Prophet's Tears calls onUseRelic with choice=0 for ignore prereq", () => {
    const onUseRelic = vi.fn()
    const relic = makeRelic({ name: "The Prophet's Tears", exhaustable: true })
    render(<RelicPanel relics={[relic]} isActivePlayer phase="action" onUseRelic={onUseRelic} controlledPlanets={[]} discardedActionCards={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /exhaust/i }))
    fireEvent.click(screen.getByText(/ignore prerequisite/i))
    expect(onUseRelic).toHaveBeenCalledWith('relic-row-1', expect.objectContaining({ choice: 0 }))
  })

  it("Prophet's Tears calls onUseRelic with choice=1 for draw action card", () => {
    const onUseRelic = vi.fn()
    const relic = makeRelic({ name: "The Prophet's Tears", exhaustable: true })
    render(<RelicPanel relics={[relic]} isActivePlayer phase="action" onUseRelic={onUseRelic} controlledPlanets={[]} discardedActionCards={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /exhaust/i }))
    fireEvent.click(screen.getByText(/draw action card/i))
    expect(onUseRelic).toHaveBeenCalledWith('relic-row-1', expect.objectContaining({ choice: 1 }))
  })

  it('Crown Of Emphidia explore button disabled outside action phase', () => {
    const relic = makeRelic({ name: 'The Crown Of Emphidia', exhaustable: true, purge_on_use: true })
    render(<RelicPanel relics={[relic]} isActivePlayer phase="status" onUseRelic={vi.fn()} controlledPlanets={[{ name: 'Mecatol Rex', deckType: 'cultural' }]} discardedActionCards={[]} />)
    expect(screen.getByRole('button', { name: /explore/i }).disabled).toBe(true)
  })

  it('Crown Of Emphidia purge_for_vp button disabled outside status phase', () => {
    const relic = makeRelic({ name: 'The Crown Of Emphidia', exhaustable: true, purge_on_use: true })
    render(<RelicPanel relics={[relic]} isActivePlayer phase="action" onUseRelic={vi.fn()} controlledPlanets={[{ name: 'Mecatol Rex', deckType: 'cultural' }]} discardedActionCards={[]} controlsTombOfEmphidia={true} />)
    expect(screen.getByRole('button', { name: /purge for vp/i }).disabled).toBe(true)
  })

  it('Codex button opens discard browser and calls onUseRelic with cardIds', () => {
    const onUseRelic = vi.fn()
    const relic = makeRelic({ name: 'The Codex', purge_on_use: true })
    const cards = [{ id: 'c1', name: 'Blitz', text: 'text' }]
    render(<RelicPanel relics={[relic]} isActivePlayer phase="action" onUseRelic={onUseRelic} controlledPlanets={[]} discardedActionCards={cards} />)
    fireEvent.click(screen.getByRole('button', { name: /use \(action\)/i }))
    expect(screen.getByText('Blitz')).toBeTruthy()  // discard modal opened
  })
})
```

- [ ] **Step 3: Run to verify tests fail**

```bash
npx vitest run tests/components/RelicPanel.test.jsx
```

Expected: many new tests fail.

- [ ] **Step 4: Update `RelicPanel.jsx`**

Replace the file contents with the updated component. The key changes from the Phase 17 spec:

```jsx
import { useState } from 'react'
import DiscardBrowserModal from './DiscardBrowserModal.jsx'

const ACTION_RELICS = ['Stellar Converter', 'The Codex']
const PHASE_B_RELICS = ['Dominus Orb', 'Stellar Converter', 'The Crown Of Thalnos']

export default function RelicPanel({
  relics,
  isActivePlayer,
  phase,
  onUseRelic,
  controlledPlanets = [],     // [{ name, deckType }]
  discardedActionCards = [],
  controlsTombOfEmphidia = false,
}) {
  const [prophetsOpen, setProphetsOpen] = useState(false)
  const [codexModalOpen, setCodexModalOpen] = useState(false)
  const [emphidiaPicker, setEmphidiaPicker] = useState(false)

  if (!relics || relics.length === 0) return null

  return (
    <div className="panel panel-inset flex flex-col gap-3">
      <p className="label">Relics</p>

      {relics.map(relic => (
        <div key={relic.id} className="flex flex-col gap-1 border-t border-border pt-2">
          <p className={`font-bold text-sm ${relic.exhausted || relic.state === 'purged' ? 'text-muted' : 'text-bright'}`}>
            {relic.name}
          </p>
          <p className="text-muted text-xs">{relic.text}</p>

          {relic.exhaustable && (
            <span className={`text-xs px-1 rounded ${relic.exhausted ? 'bg-hull text-muted' : 'bg-success/20 text-success'}`}>
              {relic.exhausted ? 'Exhausted' : 'Ready'}
            </span>
          )}

          {/* Passive relics */}
          {relic.name === 'The Obsidian' && (
            <span className="text-xs text-gold">+1 secret objective limit</span>
          )}
          {relic.name === 'Shard Of The Throne' && (
            <span className="text-xs text-gold">1 VP (while held)</span>
          )}

          {/* Maw Of Worlds */}
          {relic.name === 'Maw Of Worlds' && (
            <button
              className="btn-primary text-xs"
              disabled={phase !== 'agenda' || relic.exhausted || relic.state === 'purged'}
              onClick={() => onUseRelic(relic.id, {})}
            >
              Use (Agenda Phase)
            </button>
          )}

          {/* Scepter Of Emelpar */}
          {relic.name === 'Scepter Of Emelpar' && (
            <button
              className="btn-ghost text-xs"
              disabled={relic.exhausted || relic.state === 'purged'}
              onClick={() => onUseRelic(relic.id, {})}
            >
              Exhaust
            </button>
          )}

          {/* The Prophet's Tears */}
          {relic.name === "The Prophet's Tears" && !prophetsOpen && (
            <button
              className="btn-ghost text-xs"
              disabled={relic.exhausted || relic.state === 'purged'}
              onClick={() => setProphetsOpen(true)}
            >
              Exhaust
            </button>
          )}
          {relic.name === "The Prophet's Tears" && prophetsOpen && (
            <div className="flex flex-col gap-1">
              <button className="btn-ghost text-xs" onClick={() => { setProphetsOpen(false); onUseRelic(relic.id, { choice: 0 }) }}>
                Ignore prerequisite
              </button>
              <button className="btn-ghost text-xs" onClick={() => { setProphetsOpen(false); onUseRelic(relic.id, { choice: 1 }) }}>
                Draw action card
              </button>
              <button className="btn-ghost text-xs text-muted" onClick={() => setProphetsOpen(false)}>Cancel</button>
            </div>
          )}

          {/* The Codex */}
          {relic.name === 'The Codex' && (
            <>
              <button
                className="btn-primary text-xs"
                disabled={!isActivePlayer || relic.exhausted || relic.state === 'purged'}
                onClick={() => setCodexModalOpen(true)}
              >
                Use (Action)
              </button>
              <DiscardBrowserModal
                open={codexModalOpen}
                cards={discardedActionCards}
                maxSelect={3}
                onConfirm={(cardIds) => { setCodexModalOpen(false); onUseRelic(relic.id, { cardIds }) }}
                onClose={() => setCodexModalOpen(false)}
              />
            </>
          )}

          {/* The Crown Of Emphidia */}
          {relic.name === 'The Crown Of Emphidia' && (
            <div className="flex flex-col gap-1">
              <button
                className="btn-ghost text-xs"
                disabled={phase !== 'action' || relic.exhausted || relic.state === 'purged'}
                onClick={() => {
                  // In a real implementation, open a planet picker here
                  // For now, if only one planet, use it directly
                  const planet = controlledPlanets[0]
                  if (planet) onUseRelic(relic.id, { useType: 'explore', planetName: planet.name, deckType: planet.deckType })
                }}
              >
                Explore (after Action)
              </button>
              <button
                className="btn-ghost text-xs"
                disabled={phase !== 'status' || relic.state === 'purged' || !controlsTombOfEmphidia}
                onClick={() => onUseRelic(relic.id, { useType: 'purge_for_vp' })}
              >
                Purge for VP (Status Phase)
              </button>
            </div>
          )}

          {/* Phase B relics — disabled placeholder */}
          {PHASE_B_RELICS.includes(relic.name) && (
            <button className="btn-ghost text-xs opacity-40 cursor-not-allowed" disabled title="Not yet implemented">
              Use (Coming soon)
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/components/RelicPanel.test.jsx
```

Expected: all pass.

- [ ] **Step 6: Run full suite**

```bash
npx vitest run
```

Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/components/game/RelicPanel.jsx tests/components/RelicPanel.test.jsx
git commit -m "feat: update RelicPanel with per-relic Phase 42 UIs — Maw, Scepter, Prophet's Tears, Codex, Emphidia, passive badges"
```

---

## Task 8: Deploy and mark phase complete

- [ ] **Step 1: Deploy updated Edge Functions**

```bash
supabase functions deploy game-use-relic --no-verify-jwt
supabase functions deploy game-use-relic-fragment --no-verify-jwt
supabase functions deploy game-resolve-exploration-card --no-verify-jwt
```

- [ ] **Step 2: Run full test suite one final time**

```bash
cd ti4-companion-web && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Update `_index.md` — mark Phase 42 rows as `done`**

In `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`, change all Phase 42 rows from `planned` to `done`.

- [ ] **Step 4: Commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "docs: mark Phase 42 Relic Card Effects A as done"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ The Obsidian — on-gain draw + passive limit (Tasks 1, 4)
- ✅ Maw Of Worlds — agenda phase gate + exhaust_planets + gain_technology (Tasks 1, 3)
- ✅ Scepter Of Emelpar — exhaust-only, no ops (Tasks 1, 7)
- ✅ The Prophet's Tears — choose_one fix + enriched response (Tasks 1, 3, 7)
- ✅ The Codex — multi-card take_from_discard + DiscardBrowserModal (Tasks 2, 6, 7)
- ✅ Crown of Emphidia — explore_planet op + purge_for_vp path (Tasks 2, 3, 7)
- ✅ Enigmatic Device removed (Task 1)
- ✅ gain_relic sets gainedRelicName (Task 2)
- ✅ applyOnGainRelicEffect wired in both gain flows (Task 4)

**Phase B relics:** Dominus Orb, Stellar Converter, Crown of Thalnos, Shard of the Throne — all left as stubs with disabled UI buttons. Covered in Phase 43.
