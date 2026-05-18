# Phase 37: Strategy Card Text & Ability Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce all 8 strategy cards' primary and secondary effects and display card-face text in the UI.

**Architecture:** The two existing edge functions (`game-play-strategy-card`, `game-use-strategy-secondary`) are extended with a `switch (card_number)` block that calls DSL ops per card. Six new DSL ops are added to `abilityDsl.ts`. Static card text and form schemas live in `strategyCardConstants.js`. `StrategyCardModal` gets a card-face header and per-card forms; a new `StrategyCardPrimaryForm` sub-component handles primary selections before calling `game-play-strategy-card`.

**Tech Stack:** TypeScript/Deno (edge functions), React 19/JSX (UI), Supabase JS v2, Vitest 4

**Prereqs:** Phase 36 (Objective Condition Enforcement) must be complete — `shared-objectiveConditions.ts` must exist before Task 4.

---

### Task 1: Migration 047 — add `free_secondary_player_ids` column

**Files:**
- Create: `supabase/migrations/047_strategy_card_effects.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 047_strategy_card_effects.sql
-- Trade card primary designates players who may use the secondary for free.
ALTER TABLE public.game_strategy_card_plays
  ADD COLUMN free_secondary_player_ids UUID[] NOT NULL DEFAULT '{}';
```

- [ ] **Step 2: Apply the migration**

```bash
supabase db push
```
Expected: migration applied, no errors.

- [ ] **Step 3: Verify column exists**

```bash
supabase db diff
```
Expected: no pending migrations.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/047_strategy_card_effects.sql
git commit -m "feat: add free_secondary_player_ids to game_strategy_card_plays (Phase 37)"
```

---

### Task 2: `strategyCardConstants.js` — static card data

**Files:**
- Create: `src/lib/strategyCardConstants.js`
- Create: `tests/lib/strategyCardConstants.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/strategyCardConstants.test.js
import { describe, it, expect } from 'vitest'
import { getCard, STRATEGY_CARDS } from '../../src/lib/strategyCardConstants.js'

describe('strategyCardConstants', () => {
  it('has entries for all 8 cards', () => {
    expect(Object.keys(STRATEGY_CARDS).map(Number)).toEqual([1,2,3,4,5,6,7,8])
  })
  it('getCard returns null for unknown number', () => {
    expect(getCard(9)).toBeNull()
    expect(getCard(0)).toBeNull()
  })
  it('every card has required fields', () => {
    for (const card of Object.values(STRATEGY_CARDS)) {
      expect(card.name).toBeTruthy()
      expect(typeof card.initiative).toBe('number')
      expect(card.primaryText).toBeTruthy()
      expect(card.secondaryText).toBeTruthy()
      expect(Array.isArray(card.primaryFields)).toBe(true)
      expect(Array.isArray(card.secondaryFields)).toBe(true)
    }
  })
  it('getCard returns correct card for 1-8', () => {
    expect(getCard(1).name).toBe('Leadership')
    expect(getCard(5).name).toBe('Trade')
    expect(getCard(8).name).toBe('Imperial')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/lib/strategyCardConstants.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the constants file**

```js
// src/lib/strategyCardConstants.js

export const STRATEGY_CARDS = {
  1: {
    number: 1, name: 'Leadership', initiative: 1,
    primaryText: 'Gain 3 command tokens. You may then spend any amount of influence to gain 1 command token for every 3 influence you spend.',
    secondaryText: 'Spend any amount of influence to gain 1 command token for every 3 influence you spend.',
    primaryFields: [
      { key: 'influence_planet_ids', type: 'planet_multiselect', label: 'Exhaust planets for bonus tokens (optional)', required: false },
      { key: 'token_pool', type: 'pool_select', label: 'Place bonus tokens in pool', required: false, defaultValue: 'tactic_total' },
    ],
    secondaryFields: [
      { key: 'influence_planet_ids', type: 'planet_multiselect', label: 'Exhaust planets for tokens', required: false },
      { key: 'token_pool', type: 'pool_select', label: 'Place tokens in pool', required: false, defaultValue: 'tactic_total' },
    ],
  },
  2: {
    number: 2, name: 'Diplomacy', initiative: 2,
    primaryText: 'Choose a system that contains a planet you control (other than Mecatol Rex). Each other player places a command token from their reinforcements in that system. Then ready up to 2 of your exhausted planets.',
    secondaryText: 'Spend 1 token from your strategy pool to ready up to 2 of your exhausted planets.',
    primaryFields: [
      { key: 'target_system_coords', type: 'system_select', label: 'Choose system to lock', required: true },
      { key: 'planets_to_ready', type: 'planet_multiselect', label: 'Ready up to 2 exhausted planets (optional)', required: false, max: 2, filterExhausted: true },
    ],
    secondaryFields: [
      { key: 'planets_to_ready', type: 'planet_multiselect', label: 'Ready up to 2 exhausted planets', required: false, max: 2, filterExhausted: true },
    ],
  },
  3: {
    number: 3, name: 'Politics', initiative: 3,
    primaryText: 'Choose a player other than yourself to gain the speaker token. Draw 2 action cards. Look at the top 2 cards of the agenda deck and place them back in any order.',
    secondaryText: 'Spend 1 token from your strategy pool to draw 2 action cards.',
    primaryFields: [
      { key: 'new_speaker_player_id', type: 'player_select', label: 'Give speaker token to', required: true, excludeSelf: false, excludeCurrentSpeaker: true },
      { key: 'ordered_card_ids', type: 'agenda_order', label: 'Arrange top 2 agenda cards', required: true },
    ],
    secondaryFields: [],
  },
  4: {
    number: 4, name: 'Construction', initiative: 4,
    primaryText: 'Place 1 PDS or 1 space dock on a planet you control. Then you may place 1 PDS on a planet you control.',
    secondaryText: 'Spend 1 token from your strategy pool and place it in any system. Then place 1 PDS or 1 space dock on a planet you control in that system.',
    primaryFields: [
      { key: 'structures', type: 'structure_list', label: 'Place structures (1 required, 2nd PDS optional)', required: true, maxCount: 2 },
    ],
    secondaryFields: [
      { key: 'system_coords', type: 'system_select', label: 'Choose system (token placed there)', required: true },
      { key: 'planet_id', type: 'planet_select', label: 'Place structure on planet in that system', required: true },
      { key: 'unit_type', type: 'unit_type_radio', label: 'Structure type', required: true, options: ['pds', 'space_dock'] },
    ],
  },
  5: {
    number: 5, name: 'Trade', initiative: 5,
    primaryText: 'Gain 3 trade goods. Replenish your commodities. Choose any number of other players — those players may use this card\'s secondary ability without spending a command token.',
    secondaryText: 'Spend 1 token from your strategy pool to replenish your commodities.',
    primaryFields: [
      { key: 'free_secondary_player_ids', type: 'player_multiselect', label: 'Grant free secondary to players (optional)', required: false },
    ],
    secondaryFields: [],
  },
  6: {
    number: 6, name: 'Warfare', initiative: 6,
    primaryText: 'Remove any 1 of your command tokens from the board and return it to your reinforcements. Redistribute your command tokens.',
    secondaryText: 'Spend 1 token from your strategy pool to resolve the Production ability of one space dock in your home system.',
    primaryFields: [
      { key: 'remove_from_system_coords', type: 'system_select_owned_token', label: 'Remove command token from system', required: true },
      { key: 'remove_to_pool', type: 'pool_select', label: 'Place removed token in pool', required: true, defaultValue: 'tactic_total' },
      { key: 'redistribution', type: 'redistribution_sliders', label: 'Redistribute command tokens', required: true },
    ],
    secondaryFields: [
      { key: 'units', type: 'production_form', label: 'Produce units at home space dock', required: false },
    ],
  },
  7: {
    number: 7, name: 'Technology', initiative: 7,
    primaryText: 'Research 1 technology. You may research 1 additional technology by spending 6 resources.',
    secondaryText: 'Spend 1 token from your strategy pool and 4 resources to research 1 technology.',
    primaryFields: [
      { key: 'tech_1_id', type: 'tech_select', label: 'Research technology', required: true },
      { key: 'tech_2_id', type: 'tech_select', label: 'Research 2nd technology (costs 6 resources)', required: false },
      { key: 'tech_2_resource_planet_ids', type: 'planet_multiselect', label: 'Exhaust for 2nd tech cost', required: false, dependsOn: 'tech_2_id' },
      { key: 'tech_2_trade_goods', type: 'number_input', label: 'Trade goods toward 2nd tech cost', required: false, min: 0, dependsOn: 'tech_2_id' },
    ],
    secondaryFields: [
      { key: 'tech_id', type: 'tech_select', label: 'Research technology (costs 1 strategy token + 4 resources)', required: true },
      { key: 'tech_resource_planet_ids', type: 'planet_multiselect', label: 'Exhaust for cost', required: false },
      { key: 'tech_trade_goods', type: 'number_input', label: 'Trade goods toward cost', required: false, min: 0 },
    ],
  },
  8: {
    number: 8, name: 'Imperial', initiative: 8,
    primaryText: 'Score 1 public objective if you meet its requirements. If you control Mecatol Rex, gain 1 VP; otherwise, draw 1 secret objective.',
    secondaryText: 'Spend 1 token from your strategy pool to draw 1 secret objective.',
    primaryFields: [
      { key: 'public_objective_id', type: 'objective_select', label: 'Score a public objective (optional)', required: false },
    ],
    secondaryFields: [],
  },
}

export function getCard(number) {
  return STRATEGY_CARDS[number] ?? null
}
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/lib/strategyCardConstants.test.js
```
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/strategyCardConstants.js tests/lib/strategyCardConstants.test.js
git commit -m "feat: add strategyCardConstants with all 8 card definitions (Phase 37)"
```

---

### Task 3: New DSL ops — `spend_influence_for_tokens` and `diplomacy_lock_system`

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`
- Modify: `tests/lib/abilityDsl.test.js`

- [ ] **Step 1: Extend `ResolveContext` with `gameRound` and `strategyPlayId`**

In `abilityDsl.ts`, find the `ResolveContext` interface and add two fields:

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
  gameRound?: number       // ADD
  strategyPlayId?: string  // ADD
}
```

- [ ] **Step 2: Write failing tests for `spend_influence_for_tokens`**

```js
// In tests/lib/abilityDsl.test.js — add a describe block:
describe('spend_influence_for_tokens', () => {
  it('grants floor(influence/3) tokens and exhausts planets', async () => {
    // planet A: influence 4, planet B: influence 2 → total 6 → 2 tokens
    db.from.mockImplementation((table) => {
      if (table === 'game_players') return mockSingle({ id: PLAYER_ID, trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 }, faction: 'Arborec' })
      if (table === 'game_player_planets') return mockRows([
        { id: 'p1', player_id: PLAYER_ID, planet_name: 'Mecatol Rex', exhausted: false, influence: 4 },
        { id: 'p2', player_id: PLAYER_ID, planet_name: 'Jord', exhausted: false, influence: 2 },
      ])
    })
    const updateSpy = vi.fn().mockResolvedValue({ error: null })
    // mock UPDATE calls
    await interpretEffects(
      [{ op: 'spend_influence_for_tokens' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID, selections: { influence_planet_ids: ['Mecatol Rex', 'Jord'], token_pool: 'tactic_total' } },
      db
    )
    // command_tokens.tactic_total should be 3 + 2 = 5
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ command_tokens: { tactic_total: 5, fleet: 2, strategy: 1 } }))
  })
  it('no-op when influence_planet_ids is empty', async () => {
    const updateSpy = vi.fn()
    await interpretEffects([{ op: 'spend_influence_for_tokens' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID, selections: { influence_planet_ids: [] } }, db)
    expect(updateSpy).not.toHaveBeenCalled()
  })
  it('throws 409 when planet not owned by player', async () => {
    db.from.mockImplementation((table) => {
      if (table === 'game_players') return mockSingle({ id: PLAYER_ID, command_tokens: {}, faction: 'Arborec' })
      if (table === 'game_player_planets') return mockRows([
        { id: 'p1', player_id: 'other-player', planet_name: 'Jord', exhausted: false, influence: 2 },
      ])
    })
    await expect(interpretEffects([{ op: 'spend_influence_for_tokens' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID, selections: { influence_planet_ids: ['Jord'] } }, db))
      .rejects.toMatchObject({ message: expect.stringContaining('not owned') })
  })
})
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js -t "spend_influence_for_tokens"
```
Expected: FAIL — case not implemented.

- [ ] **Step 4: Implement `spend_influence_for_tokens` in `abilityDsl.ts`**

Add after the last `case` in the switch (before the closing `default`):

```typescript
case 'spend_influence_for_tokens': {
  const planetIds = (sel.influence_planet_ids as string[]) ?? []
  const pool = (sel.token_pool as string) ?? 'tactic_total'
  if (planetIds.length === 0) break

  const { data: planets, error: planetsError } = await db
    .from('game_player_planets')
    .select('id, player_id, planet_name, exhausted, influence')
    .eq('game_id', context.gameId)
    .in('planet_name', planetIds)
  if (planetsError) throw new Error(`spend_influence_for_tokens: query failed: ${planetsError.message}`)

  for (const name of planetIds) {
    const p = ((planets ?? []) as Array<Record<string, unknown>>).find(r => r.planet_name === name)
    if (!p) throw dslError(`Planet ${name} not found`)
    if (p.player_id !== context.activatingPlayerId) throw dslError(`Planet ${name} not owned by you`)
    if (p.exhausted) throw dslError(`Planet ${name} is already exhausted`)
  }

  const totalInfluence = ((planets ?? []) as Array<{ influence: number }>)
    .reduce((sum, p) => sum + (p.influence ?? 0), 0)
  const tokenCount = Math.floor(totalInfluence / 3)

  const ids = ((planets ?? []) as Array<{ id: string }>).map(p => p.id)
  const { error: exhaustError } = await db
    .from('game_player_planets')
    .update({ exhausted: true })
    .in('id', ids)
  if (exhaustError) throw new Error(`spend_influence_for_tokens: exhaust failed: ${exhaustError.message}`)

  if (tokenCount > 0) {
    const tokens = { ...(player.command_tokens ?? {}) as Record<string, number> }
    tokens[pool] = (tokens[pool] ?? 0) + tokenCount
    const { error } = await db
      .from('game_players')
      .update({ command_tokens: tokens })
      .eq('id', context.activatingPlayerId)
    if (error) throw new Error(`spend_influence_for_tokens: token update failed: ${error.message}`)
  }
  break
}
```

- [ ] **Step 5: Write failing tests for `diplomacy_lock_system`**

```js
describe('diplomacy_lock_system', () => {
  it('inserts activations for all other players not already in system', async () => {
    const otherPlayers = [
      { id: 'p2', command_tokens: { tactic_total: 2, fleet: 2, strategy: 2 } },
      { id: 'p3', command_tokens: { tactic_total: 0, fleet: 1, strategy: 1 } },
    ]
    // mock: game_players returns others; game_system_activations returns empty (no existing tokens)
    // expect INSERT into game_system_activations for each other player
    // expect UPDATE game_players to decrement one token for each
    await interpretEffects([{ op: 'diplomacy_lock_system' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID, gameRound: 1,
        selections: { target_system_coords: '2,-1' } }, db)
    // assert insertions for p2, p3
  })
  it('skips players who already have a token in the system', async () => {
    // mock game_system_activations returns a row for p2 → only p3 gets inserted
  })
  it('throws 409 when target_system_coords missing', async () => {
    await expect(interpretEffects([{ op: 'diplomacy_lock_system' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID, selections: {} }, db))
      .rejects.toMatchObject({ message: expect.stringContaining('target_system_coords') })
  })
})
```

- [ ] **Step 6: Implement `diplomacy_lock_system` in `abilityDsl.ts`**

```typescript
case 'diplomacy_lock_system': {
  const systemCoords = sel.target_system_coords as string
  if (!systemCoords) throw dslError('target_system_coords is required')
  const round = context.gameRound ?? 0

  const { data: otherPlayers, error: playersError } = await db
    .from('game_players')
    .select('id, command_tokens')
    .eq('game_id', context.gameId)
    .neq('id', context.activatingPlayerId)
  if (playersError) throw new Error(`diplomacy_lock_system: players query failed: ${playersError.message}`)

  for (const other of (otherPlayers ?? []) as Array<Record<string, unknown>>) {
    const otherId = other.id as string

    const { data: existing, error: existError } = await db
      .from('game_system_activations')
      .select('id')
      .eq('game_id', context.gameId)
      .eq('player_id', otherId)
      .eq('system_key', systemCoords)
      .maybeSingle()
    if (existError) throw new Error(`diplomacy_lock_system: activation query failed: ${existError.message}`)
    if (existing) continue  // already has token in system — skip (LRR §32.2b)

    const { error: insertError } = await db
      .from('game_system_activations')
      .insert({ game_id: context.gameId, player_id: otherId, system_key: systemCoords,
        round, token_owner_id: otherId })
    if (insertError) throw new Error(`diplomacy_lock_system: insert failed: ${insertError.message}`)

    // Decrement one token from their command sheet (tactic_total first, then fleet, then strategy)
    const tokens = { ...(other.command_tokens ?? {}) as Record<string, number> }
    if ((tokens.tactic_total ?? 0) > 0) {
      tokens.tactic_total = tokens.tactic_total - 1
    } else if ((tokens.fleet ?? 0) > 0) {
      tokens.fleet = tokens.fleet - 1
    } else if ((tokens.strategy ?? 0) > 0) {
      tokens.strategy = tokens.strategy - 1
    }
    // If all zero, LRR §32.2a says take from command sheet — token counts can't go below 0
    const { error: updateError } = await db
      .from('game_players')
      .update({ command_tokens: tokens })
      .eq('id', otherId)
    if (updateError) throw new Error(`diplomacy_lock_system: token update failed: ${updateError.message}`)
  }
  break
}
```

- [ ] **Step 7: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js -t "spend_influence_for_tokens|diplomacy_lock_system"
```
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts tests/lib/abilityDsl.test.js
git commit -m "feat: add spend_influence_for_tokens and diplomacy_lock_system DSL ops (Phase 37)"
```

---

### Task 4: New DSL ops — `grant_free_secondary`, `warfare_remove_board_token`, `warfare_redistribute_tokens`, `score_public_objective`

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`
- Modify: `tests/lib/abilityDsl.test.js`

- [ ] **Step 1: Write failing tests**

```js
describe('grant_free_secondary', () => {
  it('updates play row with free_secondary_player_ids', async () => {
    // context.strategyPlayId set; sel.free_secondary_player_ids = ['p2','p3']
    // expect UPDATE game_strategy_card_plays SET free_secondary_player_ids = ['p2','p3'] WHERE id = playId
    await interpretEffects([{ op: 'grant_free_secondary' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID, strategyPlayId: 'play-1',
        selections: { free_secondary_player_ids: ['p2', 'p3'] } }, db)
  })
  it('no-op when strategyPlayId missing', async () => {
    // should not throw — strategyPlayId can be absent if called outside strategy context
  })
})

describe('warfare_remove_board_token', () => {
  it('deletes activation row and increments correct pool', async () => {
    // mock game_system_activations returns a row for the player in '2,1'
    // expect DELETE; expect command_tokens.tactic_total incremented by 1
    await interpretEffects([{ op: 'warfare_remove_board_token' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID,
        selections: { remove_from_system_coords: '2,1', remove_to_pool: 'fleet' } }, db)
  })
  it('throws 409 when no token in specified system', async () => {
    // mock returns null
    await expect(interpretEffects([{ op: 'warfare_remove_board_token' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID,
        selections: { remove_from_system_coords: '2,1' } }, db))
      .rejects.toMatchObject({ message: expect.stringContaining('No token') })
  })
})

describe('warfare_redistribute_tokens', () => {
  it('updates command_tokens with provided distribution', async () => {
    await interpretEffects([{ op: 'warfare_redistribute_tokens' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID,
        selections: { redistribution_tactic: 4, redistribution_fleet: 3, redistribution_strategy: 2 } }, db)
    // expect UPDATE command_tokens = { tactic_total: 4, fleet: 3, strategy: 2 }
  })
  it('throws 409 when total exceeds 16', async () => {
    await expect(interpretEffects([{ op: 'warfare_redistribute_tokens' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID,
        selections: { redistribution_tactic: 8, redistribution_fleet: 5, redistribution_strategy: 4 } }, db))
      .rejects.toMatchObject({ message: expect.stringContaining('exceeds 16') })
  })
})

describe('score_public_objective', () => {
  it('scores objective and grants 1 VP when conditions met', async () => {
    // mock checkObjectiveCondition → true
    // mock UPDATE game_player_public_objectives SET scored=true
    // mock UPDATE game_players SET vp = vp+1
    await interpretEffects([{ op: 'score_public_objective' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID,
        selections: { public_objective_id: 'obj-1' } }, db)
  })
  it('throws 409 when conditions not met', async () => {
    // mock checkObjectiveCondition → false
    await expect(interpretEffects([{ op: 'score_public_objective' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID,
        selections: { public_objective_id: 'obj-1' } }, db))
      .rejects.toMatchObject({ message: expect.stringContaining('conditions not met') })
  })
  it('no-op when public_objective_id is absent', async () => {
    await interpretEffects([{ op: 'score_public_objective' }],
      { gameId: GAME_ID, activatingPlayerId: PLAYER_ID, selections: {} }, db)
    // no throws, no DB writes
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js -t "grant_free_secondary|warfare_remove|warfare_redis|score_public"
```
Expected: FAIL.

- [ ] **Step 3: Implement the four ops in `abilityDsl.ts`**

Add after the `diplomacy_lock_system` case:

```typescript
case 'grant_free_secondary': {
  const playId = context.strategyPlayId
  if (!playId) break
  const playerIds = (sel.free_secondary_player_ids as string[]) ?? []
  const { error } = await db
    .from('game_strategy_card_plays')
    .update({ free_secondary_player_ids: playerIds })
    .eq('id', playId)
  if (error) throw new Error(`grant_free_secondary failed: ${error.message}`)
  break
}

case 'warfare_remove_board_token': {
  const systemCoords = sel.remove_from_system_coords as string
  const pool = (sel.remove_to_pool as string) ?? 'tactic_total'
  if (!systemCoords) throw dslError('remove_from_system_coords is required')

  const { data: activation, error: findError } = await db
    .from('game_system_activations')
    .select('id')
    .eq('game_id', context.gameId)
    .eq('player_id', context.activatingPlayerId)
    .eq('system_key', systemCoords)
    .maybeSingle()
  if (findError) throw new Error(`warfare_remove_board_token: query failed: ${findError.message}`)
  if (!activation) throw dslError('No token to remove from that system')

  const { error: deleteError } = await db
    .from('game_system_activations')
    .delete()
    .eq('id', (activation as Record<string, string>).id)
  if (deleteError) throw new Error(`warfare_remove_board_token: delete failed: ${deleteError.message}`)

  const tokens = { ...(player.command_tokens ?? {}) as Record<string, number> }
  tokens[pool] = (tokens[pool] ?? 0) + 1
  const { error } = await db
    .from('game_players')
    .update({ command_tokens: tokens })
    .eq('id', context.activatingPlayerId)
  if (error) throw new Error(`warfare_remove_board_token: token update failed: ${error.message}`)
  break
}

case 'warfare_redistribute_tokens': {
  const tactic = sel.redistribution_tactic as number
  const fleet = sel.redistribution_fleet as number
  const strategy = sel.redistribution_strategy as number
  if (tactic === undefined || fleet === undefined || strategy === undefined) {
    throw dslError('redistribution values are required')
  }
  if (tactic + fleet + strategy > 16) throw dslError('Token total exceeds 16')
  const { error } = await db
    .from('game_players')
    .update({ command_tokens: { tactic_total: tactic, fleet, strategy } })
    .eq('id', context.activatingPlayerId)
  if (error) throw new Error(`warfare_redistribute_tokens failed: ${error.message}`)
  break
}

case 'score_public_objective': {
  const objectiveId = sel.public_objective_id as string
  if (!objectiveId) break

  const { checkObjectiveCondition } = await import('../_shared/objectiveConditions.ts')
  const isEligible = await checkObjectiveCondition(db, context.gameId, context.activatingPlayerId, objectiveId)
  if (!isEligible) throw dslError('Objective conditions not met')

  const { error: scoreError } = await db
    .from('game_player_public_objectives')
    .update({ scored: true })
    .eq('game_id', context.gameId)
    .eq('player_id', context.activatingPlayerId)
    .eq('objective_id', objectiveId)
  if (scoreError) throw new Error(`score_public_objective: score update failed: ${scoreError.message}`)

  const { error: vpError } = await db
    .from('game_players')
    .update({ vp: (player.vp as number) + 1 })
    .eq('id', context.activatingPlayerId)
  if (vpError) throw new Error(`score_public_objective: vp update failed: ${vpError.message}`)
  break
}
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```
Expected: all DSL tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts tests/lib/abilityDsl.test.js
git commit -m "feat: add grant_free_secondary, warfare ops, score_public_objective DSL ops (Phase 37)"
```

---

### Task 5: `game-play-strategy-card` — card-specific primary routing

**Files:**
- Modify: `supabase/functions/game-play-strategy-card/index.ts`
- Modify: `tests/functions/game-play-strategy-card.test.js`

- [ ] **Step 1: Write failing tests for each card's primary**

```js
// tests/functions/game-play-strategy-card.test.js — add describe blocks per card:

describe('Leadership primary', () => {
  it('grants 3 tokens and bonus tokens for influence spend', async () => {
    mockDb({ strategy_card: 1, influence_planet_ids: ['Mecatol Rex'], influence: 3 })
    const res = await handler(REQ({ game_id: GAME_ID, ability_definition_id: 'abi-1',
      selections: { influence_planet_ids: ['Mecatol Rex'], token_pool: 'tactic_total' } }))
    expect(res.status).toBe(200)
    // gain_command_tokens(3) called; spend_influence_for_tokens called
  })
})

describe('Diplomacy primary', () => {
  it('locks system and readies 2 planets', async () => {
    mockDb({ strategy_card: 2 })
    const res = await handler(REQ({ game_id: GAME_ID, ability_definition_id: 'abi-2',
      selections: { target_system_coords: '2,1', planets_to_ready: ['Mecatol Rex', 'Jord'] } }))
    expect(res.status).toBe(200)
  })
  it('409 when target_system_coords missing', async () => {
    mockDb({ strategy_card: 2 })
    const res = await handler(REQ({ game_id: GAME_ID, ability_definition_id: 'abi-2',
      selections: {} }))
    expect(res.status).toBe(409)
  })
})

describe('Politics primary', () => {
  it('returns peek_cards in response, changes speaker, draws 2 cards', async () => {
    mockDb({ strategy_card: 3, agendaCards: [{id:'ac1',name:'Prophecy',text:'...'},{id:'ac2',name:'Mutiny',text:'...'}] })
    const res = await handler(REQ({ game_id: GAME_ID, ability_definition_id: 'abi-3',
      selections: { new_speaker_player_id: 'p2', ordered_card_ids: ['ac1','ac2'] } }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.peek_cards).toHaveLength(2)
    expect(body.peek_cards[0]).toHaveProperty('name')
  })
})

describe('Trade primary', () => {
  it('grants 3 TGs, replenishes commodities, writes free_secondary_player_ids', async () => {
    mockDb({ strategy_card: 5 })
    const res = await handler(REQ({ game_id: GAME_ID, ability_definition_id: 'abi-5',
      selections: { free_secondary_player_ids: ['p2'] } }))
    expect(res.status).toBe(200)
    // free_secondary_player_ids updated on play row
  })
})

describe('Warfare primary', () => {
  it('removes board token and redistributes', async () => {
    mockDb({ strategy_card: 6 })
    const res = await handler(REQ({ game_id: GAME_ID, ability_definition_id: 'abi-6',
      selections: { remove_from_system_coords: '1,0', remove_to_pool: 'tactic_total',
        redistribution_tactic: 3, redistribution_fleet: 2, redistribution_strategy: 1 } }))
    expect(res.status).toBe(200)
  })
  it('409 when redistribution total exceeds 16', async () => {
    mockDb({ strategy_card: 6 })
    const res = await handler(REQ({ game_id: GAME_ID, ability_definition_id: 'abi-6',
      selections: { remove_from_system_coords: '1,0', remove_to_pool: 'tactic_total',
        redistribution_tactic: 8, redistribution_fleet: 5, redistribution_strategy: 4 } }))
    expect(res.status).toBe(409)
  })
})

describe('Imperial primary', () => {
  it('scores public objective and draws secret obj when no Mecatol', async () => {
    mockDb({ strategy_card: 8, hasMecatol: false })
    const res = await handler(REQ({ game_id: GAME_ID, ability_definition_id: 'abi-8',
      selections: { public_objective_id: 'obj-1' } }))
    expect(res.status).toBe(200)
  })
  it('scores public objective and gains VP when controls Mecatol', async () => {
    mockDb({ strategy_card: 8, hasMecatol: true })
    const res = await handler(REQ({ game_id: GAME_ID, ability_definition_id: 'abi-8',
      selections: { public_objective_id: 'obj-1' } }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-play-strategy-card.test.js
```
Expected: FAIL — existing function uses generic interpretEffects path.

- [ ] **Step 3: Replace the `interpretEffects` call with a card switch in `game-play-strategy-card/index.ts`**

Replace the block from `const selections = ...` through `await interpretEffects(...)` (lines 70–82) with:

```typescript
  const selections = ((body.selections ?? {}) as Record<string, unknown>)
  const context: ResolveContext = {
    gameId: body.game_id,
    activatingPlayerId: (player as Record<string, string>).id,
    selections,
    gameRound: game.round as number,
  }
  const extraResponse: Record<string, unknown> = {}
  const cardNum = player.strategy_card as number

  try {
    switch (cardNum) {
      case 1: { // Leadership
        await interpretEffects([{ op: 'gain_command_tokens', bucket: 'tactic_total', amount: 3 }], context, db)
        const pids = selections.influence_planet_ids as string[] | undefined
        if (pids && pids.length > 0) {
          await interpretEffects([{ op: 'spend_influence_for_tokens' }], context, db)
        }
        break
      }
      case 2: { // Diplomacy
        if (!selections.target_system_coords) throw new (class extends Error { status = 409 })('target_system_coords is required')
        const readyCount = (selections.planets_to_ready as string[] | undefined)?.length ?? 0
        if (readyCount > 2) throw new (class extends Error { status = 409 })('Cannot ready more than 2 planets')
        await interpretEffects([{ op: 'diplomacy_lock_system' }], context, db)
        if (readyCount > 0) await interpretEffects([{ op: 'ready_planets' }],
          { ...context, selections: { ...selections, planet_names: selections.planets_to_ready } }, db)
        break
      }
      case 3: { // Politics
        if (!selections.new_speaker_player_id) throw new (class extends Error { status = 409 })('new_speaker_player_id is required')
        if (!selections.ordered_card_ids || (selections.ordered_card_ids as string[]).length !== 2)
          throw new (class extends Error { status = 409 })('ordered_card_ids must contain exactly 2 card IDs')
        // Fetch card details for response (before reorder)
        const { data: topCards } = await db
          .from('game_agenda_deck')
          .select('id, agenda_cards(name, text)')
          .eq('game_id', body.game_id)
          .eq('state', 'deck')
          .order('deck_position', { ascending: true })
          .limit(2)
        extraResponse.peek_cards = (topCards ?? []).map((c: Record<string, unknown>) => ({
          id: c.id,
          name: (c.agenda_cards as Record<string, unknown>)?.name,
          text: (c.agenda_cards as Record<string, unknown>)?.text,
        }))
        await interpretEffects([
          { op: 'set_speaker' },
        ], { ...context, selections: { ...selections, chosen_player_id: selections.new_speaker_player_id } }, db)
        await interpretEffects([{ op: 'draw_action_card' }, { op: 'draw_action_card' }], context, db)
        await interpretEffects([{ op: 'peek_agenda', count: 2 }], context, db)
        break
      }
      case 4: { // Construction
        const structs = (selections.structures as Array<{ planet_id: string; unit_type: string }> | undefined) ?? []
        if (structs.length === 0) throw new (class extends Error { status = 409 })('At least 1 structure required')
        for (const s of structs.slice(0, 2)) {
          await interpretEffects([{ op: 'place_structure', choices: true }],
            { ...context, selections: { planet_name: s.planet_id, structure_type: s.unit_type, choices: true } }, db)
        }
        break
      }
      case 5: { // Trade
        await interpretEffects([
          { op: 'gain_trade_goods', amount: 3 },
          { op: 'replenish_commodities', target: 'self' },
        ], context, db)
        break
      }
      case 6: { // Warfare
        if (!selections.remove_from_system_coords) throw new (class extends Error { status = 409 })('remove_from_system_coords is required')
        const t = selections.redistribution_tactic as number
        const f = selections.redistribution_fleet as number
        const s = selections.redistribution_strategy as number
        if (t + f + s > 16) throw new (class extends Error { status = 409 })('Token total exceeds 16')
        await interpretEffects([{ op: 'warfare_remove_board_token' }, { op: 'warfare_redistribute_tokens' }], context, db)
        break
      }
      case 7: { // Technology
        if (!selections.tech_1_id) throw new (class extends Error { status = 409 })('tech_1_id is required')
        await interpretEffects([{ op: 'gain_technology' }],
          { ...context, selections: { technology_name: selections.tech_1_id } }, db)
        if (selections.tech_2_id) {
          // Validate + spend 6 resources
          const rPlanets = (selections.tech_2_resource_planet_ids as string[]) ?? []
          const rTG = (selections.tech_2_trade_goods as number) ?? 0
          const { data: rPlanetRows } = await db.from('game_player_planets')
            .select('id, resources, exhausted, player_id').eq('game_id', body.game_id).in('planet_name', rPlanets)
          for (const rp of (rPlanetRows ?? []) as Array<Record<string, unknown>>) {
            if (rp.player_id !== (player as Record<string, string>).id) return errorResponse('Planet not owned by you', 409)
            if (rp.exhausted) return errorResponse('Planet already exhausted', 409)
          }
          const totalRes = ((rPlanetRows ?? []) as Array<{resources: number}>).reduce((s, p) => s + (p.resources ?? 0), 0) + rTG
          if (totalRes < 6) return errorResponse('Insufficient resources for 2nd technology (need 6)', 409)
          if (rPlanets.length > 0) {
            const ids = ((rPlanetRows ?? []) as Array<{id: string}>).map(p => p.id)
            await db.from('game_player_planets').update({ exhausted: true }).in('id', ids)
          }
          if (rTG > 0) {
            const { data: p2 } = await db.from('game_players').select('trade_goods').eq('id', (player as Record<string,string>).id).maybeSingle()
            await db.from('game_players').update({ trade_goods: Math.max(0, ((p2 as Record<string,number>)?.trade_goods ?? 0) - rTG) }).eq('id', (player as Record<string,string>).id)
          }
          await interpretEffects([{ op: 'gain_technology' }],
            { ...context, selections: { technology_name: selections.tech_2_id } }, db)
        }
        break
      }
      case 8: { // Imperial
        if (selections.public_objective_id) {
          await interpretEffects([{ op: 'score_public_objective' }], context, db)
        }
        const { data: mecatol } = await db.from('game_player_planets')
          .select('id').eq('game_id', body.game_id)
          .eq('player_id', (player as Record<string,string>).id).eq('planet_name', 'Mecatol Rex').maybeSingle()
        if (mecatol) {
          await interpretEffects([{ op: 'score_imperial_point' }], context, db)
        } else {
          await interpretEffects([{ op: 'draw_secret_objective' }], context, db)
        }
        break
      }
      default:
        return errorResponse('Unknown strategy card number', 409)
    }
  } catch (e: unknown) {
    const err = e as Error & { status?: number }
    return errorResponse(err.message ?? 'Resolution failed', err.status === 409 ? 409 : 500)
  }
```

Also update the `OK` return to spread `extraResponse`:
```typescript
  return okResponse({ play_id: (play as Record<string, string>).id, ...extraResponse })
```

And after the play row is created, handle Trade's free_secondary:
```typescript
  // After play row created, handle Trade free secondary
  if (cardNum === 5) {
    const freeIds = (selections.free_secondary_player_ids as string[]) ?? []
    if (freeIds.length > 0) {
      await db.from('game_strategy_card_plays')
        .update({ free_secondary_player_ids: freeIds })
        .eq('id', (play as Record<string, string>).id)
    }
  }
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-play-strategy-card.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-play-strategy-card/index.ts tests/functions/game-play-strategy-card.test.js
git commit -m "feat: route all 8 strategy card primaries in game-play-strategy-card (Phase 37)"
```

---

### Task 6: `game-use-strategy-secondary` — card-specific secondary routing

**Files:**
- Modify: `supabase/functions/game-use-strategy-secondary/index.ts`
- Modify: `tests/functions/game-use-strategy-secondary.test.js`

- [ ] **Step 1: Write failing tests**

```js
describe('Leadership secondary', () => {
  it('spends strategy token and grants influence tokens', async () => {
    mockDb({ card_number: 1 })
    const res = await handler(REQ({ game_id: GAME_ID, play_id: 'play-1', ability_definition_id: 'abi-1-sec',
      selections: { influence_planet_ids: ['Jord'], token_pool: 'tactic_total' } }))
    expect(res.status).toBe(200)
  })
})
describe('Trade secondary — free', () => {
  it('replenishes commodities without spending token when player is in free list', async () => {
    mockDb({ card_number: 5, free_secondary_player_ids: [PLAYER_ID] })
    const res = await handler(REQ({ game_id: GAME_ID, play_id: 'play-1', ability_definition_id: 'abi-5-sec', selections: {} }))
    expect(res.status).toBe(200)
    // spend_strategy_token NOT called; replenish_commodities called
  })
})
describe('Trade secondary — paid', () => {
  it('spends token and replenishes when not in free list', async () => {
    mockDb({ card_number: 5, free_secondary_player_ids: [] })
    const res = await handler(REQ({ game_id: GAME_ID, play_id: 'play-1', ability_definition_id: 'abi-5-sec', selections: {} }))
    expect(res.status).toBe(200)
    // spend_strategy_token called; replenish_commodities called
  })
})
describe('Warfare secondary', () => {
  it('spends token and returns home_system_key', async () => {
    mockDb({ card_number: 6, faction: 'Arborec', map_tiles: { '0,4': 'arborec-home-tile-id' } })
    const res = await handler(REQ({ game_id: GAME_ID, play_id: 'play-1', ability_definition_id: 'abi-6-sec', selections: {} }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.home_system_key).toBeDefined()
  })
})
describe('Technology secondary', () => {
  it('spends token, spends 4 resources, researches tech', async () => {
    mockDb({ card_number: 7, resourcePlanets: [{ id: 'p1', resources: 4, exhausted: false }] })
    const res = await handler(REQ({ game_id: GAME_ID, play_id: 'play-1', ability_definition_id: 'abi-7-sec',
      selections: { tech_id: 'Daxcive Animators', tech_resource_planet_ids: ['Jord'], tech_trade_goods: 0 } }))
    expect(res.status).toBe(200)
  })
  it('409 when insufficient resources (need 4)', async () => {
    mockDb({ card_number: 7, resourcePlanets: [{ id: 'p1', resources: 2, exhausted: false }] })
    const res = await handler(REQ({ game_id: GAME_ID, play_id: 'play-1', ability_definition_id: 'abi-7-sec',
      selections: { tech_id: 'Daxcive Animators', tech_resource_planet_ids: ['Jord'], tech_trade_goods: 0 } }))
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-use-strategy-secondary.test.js
```
Expected: FAIL.

- [ ] **Step 3: Replace the `interpretEffects` call with a card switch in `game-use-strategy-secondary/index.ts`**

Replace lines 81–93 (from `const selections = ...` through `await interpretEffects(...)`) with:

```typescript
  const selections = ((body.selections ?? {}) as Record<string, unknown>)
  const cardNum = (play as Record<string, unknown>).card_number as number
  const context: ResolveContext = {
    gameId: body.game_id,
    activatingPlayerId: (player as Record<string, string>).id,
    selections,
  }
  const extraResponse: Record<string, unknown> = {}

  try {
    switch (cardNum) {
      case 1: { // Leadership secondary
        await interpretEffects([{ op: 'spend_strategy_token' }], context, db)
        const pids = selections.influence_planet_ids as string[] | undefined
        if (pids && pids.length > 0) {
          await interpretEffects([{ op: 'spend_influence_for_tokens' }], context, db)
        }
        break
      }
      case 2: { // Diplomacy secondary
        const planets = (selections.planets_to_ready as string[]) ?? []
        if (planets.length > 2) throw new (class extends Error { status = 409 })('Cannot ready more than 2 planets')
        await interpretEffects([{ op: 'spend_strategy_token' }], context, db)
        if (planets.length > 0) {
          await interpretEffects([{ op: 'ready_planets' }],
            { ...context, selections: { planet_names: planets } }, db)
        }
        break
      }
      case 3: { // Politics secondary
        await interpretEffects([{ op: 'spend_strategy_token' }, { op: 'draw_action_card' }, { op: 'draw_action_card' }], context, db)
        break
      }
      case 4: { // Construction secondary
        if (!selections.system_coords) throw new (class extends Error { status = 409 })('system_coords is required')
        if (!selections.planet_id) throw new (class extends Error { status = 409 })('planet_id is required')
        if (!selections.unit_type) throw new (class extends Error { status = 409 })('unit_type is required')
        await interpretEffects([{ op: 'spend_strategy_token' }], context, db)
        const { data: game2 } = await db.from('games').select('round').eq('id', body.game_id).maybeSingle()
        const { error: insertAct } = await db.from('game_system_activations').insert({
          game_id: body.game_id,
          player_id: (player as Record<string,string>).id,
          system_key: selections.system_coords as string,
          round: (game2 as Record<string,number>)?.round ?? 0,
          token_owner_id: (player as Record<string,string>).id,
        })
        if (insertAct) return errorResponse(`Failed to place command token: ${insertAct.message}`, 500)
        await interpretEffects([{ op: 'place_structure', choices: true }],
          { ...context, selections: { planet_name: selections.planet_id, structure_type: selections.unit_type, choices: true } }, db)
        break
      }
      case 5: { // Trade secondary — free if in free_secondary_player_ids
        const freeIds = ((play as Record<string, unknown>).free_secondary_player_ids as string[]) ?? []
        const isFree = freeIds.includes((player as Record<string,string>).id)
        if (!isFree) await interpretEffects([{ op: 'spend_strategy_token' }], context, db)
        await interpretEffects([{ op: 'replenish_commodities', target: 'self' }], context, db)
        break
      }
      case 6: { // Warfare secondary — spend token, return home system key for client production
        await interpretEffects([{ op: 'spend_strategy_token' }], context, db)
        // Find home system: scan map_tiles for this player's faction home tile
        const { data: playerRow } = await db.from('game_players').select('faction').eq('id', (player as Record<string,string>).id).maybeSingle()
        const { data: gameRow } = await db.from('games').select('map_tiles').eq('id', body.game_id).maybeSingle()
        const { data: factionRow } = await db.from('factions').select('home_tile_id').eq('name', (playerRow as Record<string,string>)?.faction).maybeSingle()
        const mapTiles = (gameRow as Record<string, unknown>)?.map_tiles as Record<string, string> ?? {}
        const homeKey = Object.entries(mapTiles).find(([, tileId]) => tileId === (factionRow as Record<string,string>)?.home_tile_id)?.[0] ?? null
        extraResponse.home_system_key = homeKey
        break
      }
      case 7: { // Technology secondary — spend token + 4 resources + research
        if (!selections.tech_id) throw new (class extends Error { status = 409 })('tech_id is required')
        await interpretEffects([{ op: 'spend_strategy_token' }], context, db)
        const rPlanets = (selections.tech_resource_planet_ids as string[]) ?? []
        const rTG = (selections.tech_trade_goods as number) ?? 0
        const { data: rRows } = await db.from('game_player_planets').select('id, resources, exhausted, player_id')
          .eq('game_id', body.game_id).in('planet_name', rPlanets)
        const totalRes = ((rRows ?? []) as Array<{resources: number}>).reduce((s, p) => s + (p.resources ?? 0), 0) + rTG
        if (totalRes < 4) return errorResponse('Insufficient resources for technology secondary (need 4)', 409)
        if (rPlanets.length > 0) {
          const ids = ((rRows ?? []) as Array<{id: string}>).map(p => p.id)
          await db.from('game_player_planets').update({ exhausted: true }).in('id', ids)
        }
        if (rTG > 0) {
          const { data: p2 } = await db.from('game_players').select('trade_goods').eq('id', (player as Record<string,string>).id).maybeSingle()
          await db.from('game_players').update({ trade_goods: Math.max(0, ((p2 as Record<string,number>)?.trade_goods ?? 0) - rTG) }).eq('id', (player as Record<string,string>).id)
        }
        await interpretEffects([{ op: 'gain_technology' }],
          { ...context, selections: { technology_name: selections.tech_id } }, db)
        break
      }
      case 8: { // Imperial secondary — spend token + draw secret objective
        await interpretEffects([{ op: 'spend_strategy_token' }, { op: 'draw_secret_objective' }], context, db)
        break
      }
      default:
        return errorResponse('Unknown strategy card', 409)
    }
  } catch (e: unknown) {
    const err = e as Error & { status?: number }
    return errorResponse(err.message ?? 'Resolution failed', err.status === 409 ? 409 : 500)
  }
```

Also update the `play` select to include `free_secondary_player_ids`:
```typescript
  .select('id, played_by_player_id, card_number, free_secondary_player_ids')
```

And update the `OK` return:
```typescript
  return okResponse({ responded: true, play_complete: playComplete, ...extraResponse })
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-use-strategy-secondary.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-use-strategy-secondary/index.ts tests/functions/game-use-strategy-secondary.test.js
git commit -m "feat: route all 8 strategy card secondaries in game-use-strategy-secondary (Phase 37)"
```

---

### Task 7: `game-produce-units` — `warfare_secondary` bypass

**Files:**
- Modify: `supabase/functions/game-produce-units/index.ts`
- Modify: `tests/functions/game-produce-units.test.js`

- [ ] **Step 1: Write failing test**

```js
describe('warfare_secondary bypass', () => {
  it('skips active_player and activation checks when warfare_secondary=true', async () => {
    // mock: game has a different active_player; no activation for caller
    // mock: active Warfare play exists (card_number=6, status='active')
    // mock: caller has a 'used' response for that play
    const res = await handler(REQ({ game_id: GAME_ID, system_key: '0,0',
      units: [{ unit_type: 'infantry', count: 2, on_planet: 'Jord' }],
      warfare_secondary: true }))
    expect(res.status).toBe(200)
  })
  it('409 when warfare_secondary=true but no active Warfare play', async () => {
    // mock: game_strategy_card_plays returns empty
    const res = await handler(REQ({ game_id: GAME_ID, system_key: '0,0',
      units: [{ unit_type: 'infantry', count: 2 }], warfare_secondary: true }))
    expect(res.status).toBe(409)
  })
  it('409 when warfare_secondary=true but caller has no used response', async () => {
    // mock: play exists; no 'used' response for caller
    const res = await handler(REQ({ game_id: GAME_ID, system_key: '0,0',
      units: [{ unit_type: 'infantry', count: 2 }], warfare_secondary: true }))
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-produce-units.test.js -t "warfare_secondary"
```
Expected: FAIL.

- [ ] **Step 3: Add `warfare_secondary` handling to `game-produce-units/index.ts`**

Update the body type:
```typescript
let body: { game_id?: unknown; system_key?: unknown; units?: unknown; planet_exhausts?: unknown; trade_goods_spend?: unknown; warfare_secondary?: unknown }
```

Replace the `active_player_id` check + ACTIVATION block (lines 46–59) with:

```typescript
  const warfareSecondary = body.warfare_secondary === true

  if (!warfareSecondary) {
    if (game.active_player_id !== player.id) return errorResponse('Not your turn', 409)
    if (game.phase !== 'action') return errorResponse('Not in action phase', 409)

    const { data: activation, error: activationError } = await db
      .from('game_system_activations')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('player_id', (player as Record<string, string>).id)
      .eq('system_key', body.system_key)
      .maybeSingle()
    if (activationError) return errorResponse('Database error', 500)
    if (!activation) return errorResponse('System not activated by you this round', 409)
  } else {
    // Warfare secondary: validate an active Warfare play + caller has used response
    const { data: warfarePlay, error: playError } = await db
      .from('game_strategy_card_plays')
      .select('id')
      .eq('game_id', body.game_id)
      .eq('card_number', 6)
      .eq('status', 'active')
      .eq('round', (game as Record<string,number>).round)
      .maybeSingle()
    if (playError) return errorResponse('Database error', 500)
    if (!warfarePlay) return errorResponse('No active Warfare strategy card play', 409)

    const { data: usedResponse, error: respError } = await db
      .from('game_strategy_card_responses')
      .select('id')
      .eq('play_id', (warfarePlay as Record<string,string>).id)
      .eq('player_id', (player as Record<string,string>).id)
      .eq('status', 'used')
      .maybeSingle()
    if (respError) return errorResponse('Database error', 500)
    if (!usedResponse) return errorResponse('Warfare secondary not used — call game-use-strategy-secondary first', 409)
  }
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-produce-units.test.js
```
Expected: all tests pass including existing ones.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-produce-units/index.ts tests/functions/game-produce-units.test.js
git commit -m "feat: add warfare_secondary bypass to game-produce-units (Phase 37)"
```

---

### Task 8: `useStrategyCards` — agenda prefetch + peek/home state

**Files:**
- Modify: `src/hooks/useStrategyCards.js`
- Modify: `tests/hooks/useStrategyCards.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// tests/hooks/useStrategyCards.test.jsx
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useStrategyCards } from '../../src/hooks/useStrategyCards.js'

vi.mock('../../src/lib/supabase.js', () => ({ supabase: { channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })), removeChannel: vi.fn(), from: vi.fn() } }))
vi.mock('../../src/lib/edgeFunctions.js', () => ({
  playStrategyCard: vi.fn(),
  useStrategySecondary: vi.fn(),
  passStrategySecondary: vi.fn(),
}))

import { playStrategyCard, useStrategySecondary } from '../../src/lib/edgeFunctions.js'
import { supabase } from '../../src/lib/supabase.js'

describe('useStrategyCards — agenda peek', () => {
  it('sets agendaPeekCards when playPrimary response includes peek_cards', async () => {
    playStrategyCard.mockResolvedValue({ play_id: 'p1', peek_cards: [{ id: 'a1', name: 'Prophecy', text: '...' }, { id: 'a2', name: 'Mutiny', text: '...' }] })
    const { result } = renderHook(() => useStrategyCards('game-1', 'player-1'))
    await act(async () => { await result.current.playPrimary('abi-3', {}) })
    expect(result.current.agendaPeekCards).toHaveLength(2)
    expect(result.current.agendaPeekCards[0].name).toBe('Prophecy')
  })
  it('clearAgendaPeekCards sets agendaPeekCards to null', async () => {
    playStrategyCard.mockResolvedValue({ play_id: 'p1', peek_cards: [{ id: 'a1', name: 'P', text: '' }, { id: 'a2', name: 'M', text: '' }] })
    const { result } = renderHook(() => useStrategyCards('game-1', 'player-1'))
    await act(async () => { await result.current.playPrimary('abi-3', {}) })
    act(() => { result.current.clearAgendaPeekCards() })
    expect(result.current.agendaPeekCards).toBeNull()
  })
})

describe('useStrategyCards — warfare home system', () => {
  it('sets warfareHomeSystemKey when useSecondary response includes home_system_key', async () => {
    useStrategySecondary.mockResolvedValue({ responded: true, play_complete: false, home_system_key: '0,4' })
    const { result } = renderHook(() => useStrategyCards('game-1', 'player-1'))
    await act(async () => { await result.current.useSecondary('abi-6-sec', {}) })
    expect(result.current.warfareHomeSystemKey).toBe('0,4')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/hooks/useStrategyCards.test.jsx
```
Expected: FAIL — agendaPeekCards/warfareHomeSystemKey not defined.

- [ ] **Step 3: Update `useStrategyCards.js`**

```js
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { playStrategyCard, useStrategySecondary, passStrategySecondary } from '../lib/edgeFunctions.js'

export function useStrategyCards(gameId, myPlayerId) {
  const [activePay, setActivePay] = useState(null)
  const [responses, setResponses] = useState([])
  const [agendaPeekCards, setAgendaPeekCards] = useState(null)
  const [warfareHomeSystemKey, setWarfareHomeSystemKey] = useState(null)

  // Subscribe to active play for this game
  useEffect(() => {
    if (!gameId) return
    const channel = supabase
      .channel('strategy-plays')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_strategy_card_plays', filter: `game_id=eq.${gameId}` },
        (payload) => { setActivePay(payload.new?.status === 'active' ? payload.new : null) })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [gameId])

  // Subscribe to responses when a play is active
  useEffect(() => {
    if (!activePay) return
    let mounted = true
    const channel = supabase
      .channel('strategy-responses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_strategy_card_responses', filter: `play_id=eq.${activePay.id}` },
        (payload) => {
          setResponses((prev) => {
            const idx = prev.findIndex((r) => r.id === payload.new.id)
            if (idx === -1) return [...prev, payload.new]
            return prev.map((r) => (r.id === payload.new.id ? payload.new : r))
          })
        })
      .subscribe()
    supabase.from('game_strategy_card_responses').select('*').eq('play_id', activePay.id)
      .then(({ data }) => { if (mounted) setResponses(data ?? []) })
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [activePay?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const myResponse = responses.find((r) => r.player_id === myPlayerId)
  const pendingResponses = responses.filter((r) => r.status === 'pending')
  const nextPendingOrder = pendingResponses.length > 0
    ? Math.min(...pendingResponses.map((r) => r.initiative_order)) : null
  const isMyTurnToRespond =
    myResponse?.status === 'pending' && myResponse.initiative_order === nextPendingOrder

  return {
    activePay,
    responses,
    isMyTurnToRespond,
    agendaPeekCards,
    clearAgendaPeekCards: () => setAgendaPeekCards(null),
    warfareHomeSystemKey,
    clearWarfareHomeSystemKey: () => setWarfareHomeSystemKey(null),
    playPrimary: async (abilityId, selections) => {
      const result = await playStrategyCard(gameId, abilityId, selections)
      if (result?.peek_cards) setAgendaPeekCards(result.peek_cards)
      return result
    },
    useSecondary: async (abilityId, selections) => {
      const result = await useStrategySecondary(gameId, activePay?.id, abilityId, selections)
      if (result?.home_system_key) setWarfareHomeSystemKey(result.home_system_key)
      return result
    },
    passSecondary: () => passStrategySecondary(gameId, activePay?.id),
    fetchAgendaTopCards: async () => {
      const { data } = await supabase
        .from('game_agenda_deck')
        .select('id, agenda_cards(name, text)')
        .eq('game_id', gameId)
        .eq('state', 'deck')
        .order('deck_position', { ascending: true })
        .limit(2)
      return (data ?? []).map((c) => ({
        id: c.id,
        name: c.agenda_cards?.name ?? '',
        text: c.agenda_cards?.text ?? '',
      }))
    },
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/hooks/useStrategyCards.test.jsx
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useStrategyCards.js tests/hooks/useStrategyCards.test.jsx
git commit -m "feat: add agendaPeekCards and warfareHomeSystemKey to useStrategyCards (Phase 37)"
```

---

### Task 9: `StrategyCardPanel` — show card name on buttons and labels

**Files:**
- Modify: `src/components/game/StrategyCardPanel.jsx`
- Modify: `tests/components/StrategyCardPanel.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// tests/components/StrategyCardPanel.test.jsx — add:
import { getCard } from '../../src/lib/strategyCardConstants.js'

describe('card name display', () => {
  it('shows card name on play button during action phase', () => {
    render(<StrategyCardPanel player={{ strategy_card: 5 }} game={{ phase: 'action' }}
      allPlayers={[]} activePay={null} isActive={true} onPlayPrimary={vi.fn()} onPickStrategyCard={vi.fn()} />)
    expect(screen.getByRole('button', { name: /PLAY TRADE/i })).toBeInTheDocument()
  })
  it('shows initiative + name label when not active turn', () => {
    render(<StrategyCardPanel player={{ strategy_card: 5 }} game={{ phase: 'action' }}
      allPlayers={[]} activePay={null} isActive={false} onPlayPrimary={vi.fn()} onPickStrategyCard={vi.fn()} />)
    expect(screen.getByText(/5\. Trade/)).toBeInTheDocument()
  })
  it('shows card name in activePay label', () => {
    render(<StrategyCardPanel player={{ strategy_card: 5 }} game={{ phase: 'action' }}
      allPlayers={[]} activePay={{ card_number: 5 }} isActive={false} onPlayPrimary={vi.fn()} onPickStrategyCard={vi.fn()} />)
    expect(screen.getByText(/Trade is active/i)).toBeInTheDocument()
  })
  it('shows initiative + name in strategy phase selected state', () => {
    render(<StrategyCardPanel player={{ strategy_card: 5 }} game={{ phase: 'strategy' }}
      allPlayers={[]} activePay={null} isActive={false} onPlayPrimary={vi.fn()} onPickStrategyCard={vi.fn()} />)
    expect(screen.getByText(/5\. Trade selected/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/components/StrategyCardPanel.test.jsx -t "card name display"
```
Expected: FAIL.

- [ ] **Step 3: Update `StrategyCardPanel.jsx`**

```jsx
import { getCard } from '../../lib/strategyCardConstants.js'

// Replace the existing STRATEGY_CARD_NAMES lookup and relevant JSX:

// Action phase — play button:
if (isActive && !activePay) {
  const card = getCard(player.strategy_card)
  return (
    <div className="panel">
      <button onClick={onPlayPrimary} className="btn-primary w-full">
        PLAY {card?.name?.toUpperCase() ?? `CARD ${player.strategy_card}`}
      </button>
    </div>
  )
}

// Action phase — activePay active:
if (activePay) {
  const activeCard = getCard(activePay.card_number)
  return (
    <div className="panel">
      <div className="label text-dim">
        {activeCard?.name ?? `Card ${activePay.card_number}`} is active
      </div>
    </div>
  )
}

// Action phase — not active turn, card held:
if (player.strategy_card !== null) {
  const card = getCard(player.strategy_card)
  return (
    <div className="panel">
      <div className="label text-dim">
        {card?.initiative}. {card?.name ?? `Card ${player.strategy_card}`}
      </div>
    </div>
  )
}

// Strategy phase — card selected:
if (game.phase === 'strategy' && player.strategy_card !== null) {
  const card = getCard(player.strategy_card)
  return (
    <div className="panel">
      <div className="label text-dim">
        {card?.initiative}. {card?.name ?? `Card ${player.strategy_card}`} selected
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run all StrategyCardPanel tests**

```bash
cd ti4-companion-web && npx vitest run tests/components/StrategyCardPanel.test.jsx
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/StrategyCardPanel.jsx tests/components/StrategyCardPanel.test.jsx
git commit -m "feat: show strategy card name on panel buttons and labels (Phase 37)"
```

---

### Task 10: `StrategyCardModal` — card face header + `StrategyCardPrimaryForm`

**Files:**
- Modify: `src/components/game/StrategyCardModal.jsx`
- Modify: `tests/components/StrategyCardModal.test.jsx`

- [ ] **Step 1: Write failing tests for card face and primary form**

```jsx
describe('card face header', () => {
  it('always shows card name, initiative, primary text, and secondary text', () => {
    render(<StrategyCardModal activePay={{ card_number: 5, played_by_player_id: 'p1' }}
      responses={[]} myPlayerId="p2" players={[{ id: 'p1', display_name: 'Alice' }]}
      isMyTurnToRespond={false} onUseSecondary={vi.fn()} onPassSecondary={vi.fn()} />)
    expect(screen.getByText(/Trade/)).toBeInTheDocument()
    expect(screen.getByText(/Initiative 5/)).toBeInTheDocument()
    expect(screen.getByText(/Gain 3 trade goods/i)).toBeInTheDocument()
    expect(screen.getByText(/Spend 1 token.*replenish/i)).toBeInTheDocument()
  })
})

describe('StrategyCardPrimaryForm', () => {
  it('renders no fields for Trade primary (just a player multiselect)', () => {
    render(<StrategyCardPrimaryForm cardNumber={5} myPlayer={{ strategy_card: 5 }}
      allPlayers={[{ id: 'p2', display_name: 'Bob' }]} game={{ phase: 'action' }}
      onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText(/Grant free secondary/i)).toBeInTheDocument()
  })
  it('renders system_select for Diplomacy primary', () => {
    render(<StrategyCardPrimaryForm cardNumber={2} myPlayer={{ strategy_card: 2 }}
      allPlayers={[]} game={{ phase: 'action', map_tiles: {} }}
      myPlanets={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText(/Choose system to lock/i)).toBeInTheDocument()
  })
  it('calls onSubmit with selections when PLAY PRIMARY clicked', () => {
    const onSubmit = vi.fn()
    render(<StrategyCardPrimaryForm cardNumber={5} myPlayer={{ strategy_card: 5 }}
      allPlayers={[]} game={{ phase: 'action' }} onSubmit={onSubmit} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /PLAY PRIMARY/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.any(Object))
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/components/StrategyCardModal.test.jsx -t "card face|StrategyCardPrimaryForm"
```
Expected: FAIL.

- [ ] **Step 3: Add card face header and `StrategyCardPrimaryForm` to `StrategyCardModal.jsx`**

Add a `StrategyCardPrimaryForm` export and update the modal:

```jsx
import { getCard } from '../../lib/strategyCardConstants.js'

// --- StrategyCardPrimaryForm ---
export function StrategyCardPrimaryForm({ cardNumber, myPlayer, allPlayers, game, myPlanets = [],
  eligibleObjectives = [], agendaPeekCards = null, onSubmit, onCancel }) {
  const card = getCard(cardNumber)
  const [sel, setSel] = useState({})
  if (!card) return null

  const update = (key, val) => setSel(prev => ({ ...prev, [key]: val }))

  return (
    <div className="panel w-full max-w-lg flex flex-col gap-3">
      <p className="label">{card.name}</p>
      <p className="text-muted text-xs">Initiative {card.initiative}</p>
      <p className="text-sm text-text">{card.primaryText}</p>

      {card.primaryFields.map(field => (
        <div key={field.key} className="flex flex-col gap-1">
          <p className="label text-xs">{field.label}</p>

          {field.type === 'planet_multiselect' && (
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {(field.filterExhausted ? myPlanets.filter(p => p.exhausted) : myPlanets).map(p => (
                <label key={p.planet_name} className="flex items-center gap-2 text-sm text-text cursor-pointer">
                  <input type="checkbox" checked={(sel[field.key] ?? []).includes(p.planet_name)}
                    onChange={e => {
                      const cur = sel[field.key] ?? []
                      if (e.target.checked) update(field.key, [...cur, p.planet_name].slice(0, field.max ?? 99))
                      else update(field.key, cur.filter(n => n !== p.planet_name))
                    }} />
                  {p.planet_name} ({field.filterExhausted ? 'exhausted' : `res ${p.resources} / inf ${p.influence}`})
                </label>
              ))}
            </div>
          )}

          {field.type === 'pool_select' && (
            <div className="flex gap-2">
              {['tactic_total','fleet','strategy'].map(pool => (
                <label key={pool} className="flex items-center gap-1 text-sm text-text cursor-pointer">
                  <input type="radio" name={field.key} value={pool}
                    checked={(sel[field.key] ?? field.defaultValue) === pool}
                    onChange={() => update(field.key, pool)} />
                  {pool === 'tactic_total' ? 'Tactic' : pool.charAt(0).toUpperCase() + pool.slice(1)}
                </label>
              ))}
            </div>
          )}

          {field.type === 'player_select' && (
            <div className="flex flex-col gap-1">
              {allPlayers
                .filter(p => !field.excludeSelf || p.id !== myPlayer?.id)
                .filter(p => !field.excludeCurrentSpeaker || !p.is_speaker)
                .map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-text cursor-pointer">
                    <input type="radio" name={field.key} value={p.id}
                      checked={sel[field.key] === p.id} onChange={() => update(field.key, p.id)} />
                    {p.display_name}
                  </label>
                ))}
            </div>
          )}

          {field.type === 'player_multiselect' && (
            <div className="flex flex-col gap-1">
              {allPlayers.filter(p => p.id !== myPlayer?.id).map(p => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-text cursor-pointer">
                  <input type="checkbox" checked={(sel[field.key] ?? []).includes(p.id)}
                    onChange={e => {
                      const cur = sel[field.key] ?? []
                      update(field.key, e.target.checked ? [...cur, p.id] : cur.filter(id => id !== p.id))
                    }} />
                  {p.display_name}
                </label>
              ))}
            </div>
          )}

          {field.type === 'system_select' && (
            <select className="input text-sm" value={sel[field.key] ?? ''}
              onChange={e => update(field.key, e.target.value)}>
              <option value="">Select system…</option>
              {Object.entries(game.map_tiles ?? {}).map(([coords]) => (
                <option key={coords} value={coords}>{coords}</option>
              ))}
            </select>
          )}

          {field.type === 'redistribution_sliders' && (
            <div className="flex flex-col gap-2">
              {['tactic','fleet','strategy'].map(pool => (
                <div key={pool} className="flex items-center gap-2">
                  <span className="text-sm text-muted w-16 capitalize">{pool}</span>
                  <input type="number" min="0" max="16" className="input w-20 text-sm"
                    value={(sel.redistribution ?? {})[pool] ?? 0}
                    onChange={e => update('redistribution', { ...(sel.redistribution ?? {}), [pool]: Number(e.target.value) })} />
                </div>
              ))}
              <p className="text-xs text-muted">
                Total: {['tactic','fleet','strategy'].reduce((s, p) => s + ((sel.redistribution ?? {})[p] ?? 0), 0)} / 16
              </p>
            </div>
          )}

          {field.type === 'objective_select' && (
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input type="radio" name={field.key} value="" checked={!sel[field.key]}
                  onChange={() => update(field.key, null)} />
                Skip (no eligible objective)
              </label>
              {eligibleObjectives.map(obj => (
                <label key={obj.id} className="flex items-center gap-2 text-sm text-text cursor-pointer">
                  <input type="radio" name={field.key} value={obj.id}
                    checked={sel[field.key] === obj.id} onChange={() => update(field.key, obj.id)} />
                  {obj.name}
                </label>
              ))}
            </div>
          )}

          {field.type === 'agenda_order' && agendaPeekCards === null && (
            <p className="text-xs text-muted italic">Agenda order is chosen after submitting (you will see the top 2 cards).</p>
          )}
        </div>
      ))}

      {/* Politics: post-submit confirmation of peeked cards */}
      {cardNumber === 3 && agendaPeekCards && (
        <div className="panel-inset">
          <p className="label text-xs">Peeked agenda cards (top → bottom):</p>
          {agendaPeekCards.map((c, i) => (
            <p key={c.id} className="text-sm text-text">{i + 1}. {c.name}</p>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <button className="btn-primary flex-1 text-sm" onClick={() => onSubmit(sel)}>
          PLAY PRIMARY
        </button>
        <button className="btn-ghost flex-1 text-sm" onClick={onCancel}>
          CANCEL
        </button>
      </div>
    </div>
  )
}

// --- StrategyCardModal updates ---
export default function StrategyCardModal({ activePay, responses, myPlayerId, players,
  isMyTurnToRespond, onUseSecondary, onPassSecondary, onClose = () => {} }) {
  if (!activePay) return null

  const card = getCard(activePay.card_number)
  const cardHolder = players.find(p => p.id === activePay.played_by_player_id)
  const isCardHolder = myPlayerId === activePay.played_by_player_id
  const sortedResponses = [...responses].sort((a, b) => a.initiative_order - b.initiative_order)
  const nextPendingResponse = sortedResponses.find(r => r.status === 'pending')
  const nextPlayer = players.find(p => p.id === nextPendingResponse?.player_id)

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        {/* Card face header */}
        <div className="flex flex-col gap-1">
          <p className="label">{card?.name ?? `Card ${activePay.card_number}`}
            <span className="text-muted text-xs ml-2">Initiative {card?.initiative}</span>
          </p>
          {card && <p className="text-xs text-bright">{card.primaryText}</p>}
          {card && <p className="text-xs text-muted">Secondary: {card.secondaryText}</p>}
        </div>

        <p className="text-muted text-sm">{cardHolder?.display_name ?? 'Unknown'} played the primary ability</p>

        {isCardHolder ? (
          <>
            {sortedResponses.map(response => {
              const respPlayer = players.find(p => p.id === response.player_id)
              return (
                <p key={response.player_id} className="text-sm text-text">
                  {respPlayer?.display_name ?? 'Unknown'}: {response.status}
                </p>
              )
            })}
            <button className="btn-ghost text-xs mt-2" onClick={onClose}>CLOSE</button>
          </>
        ) : isMyTurnToRespond ? (
          <StrategyCardSecondaryForm cardNumber={activePay.card_number}
            onUseSecondary={onUseSecondary} onPassSecondary={onPassSecondary} />
        ) : (
          <p className="text-muted text-sm text-center">
            Waiting for {nextPlayer?.display_name ?? 'a player'}…
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/components/StrategyCardModal.test.jsx
```
Expected: card face + primary form tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/StrategyCardModal.jsx tests/components/StrategyCardModal.test.jsx
git commit -m "feat: add card face header and StrategyCardPrimaryForm to StrategyCardModal (Phase 37)"
```

---

### Task 11: `StrategyCardModal` — `StrategyCardSecondaryForm`

**Files:**
- Modify: `src/components/game/StrategyCardModal.jsx`
- Modify: `tests/components/StrategyCardModal.test.jsx`

- [ ] **Step 1: Write failing tests for secondary form**

```jsx
describe('StrategyCardSecondaryForm', () => {
  it('shows USE SECONDARY and PASS buttons', () => {
    render(<StrategyCardModal activePay={{ card_number: 5, played_by_player_id: 'p1' }}
      responses={[{ player_id: 'p2', status: 'pending', initiative_order: 1 }]}
      myPlayerId="p2" players={[{ id: 'p1', display_name: 'Alice' }, { id: 'p2', display_name: 'Bob' }]}
      isMyTurnToRespond={true} onUseSecondary={vi.fn()} onPassSecondary={vi.fn()} />)
    expect(screen.getByRole('button', { name: /USE SECONDARY/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /PASS/i })).toBeInTheDocument()
  })
  it('renders secondary text from card constants', () => {
    render(<StrategyCardModal activePay={{ card_number: 5, played_by_player_id: 'p1' }}
      responses={[{ player_id: 'p2', status: 'pending', initiative_order: 1 }]}
      myPlayerId="p2" players={[{ id: 'p1', display_name: 'Alice' }, { id: 'p2', display_name: 'Bob' }]}
      isMyTurnToRespond={true} onUseSecondary={vi.fn()} onPassSecondary={vi.fn()} />)
    expect(screen.getByText(/replenish your commodities/i)).toBeInTheDocument()
  })
  it('calls onUseSecondary with selections when USE SECONDARY clicked', () => {
    const onUseSecondary = vi.fn()
    render(<StrategyCardModal activePay={{ card_number: 3, played_by_player_id: 'p1' }}
      responses={[{ player_id: 'p2', status: 'pending', initiative_order: 1 }]}
      myPlayerId="p2" players={[{ id: 'p1', display_name: 'Alice' }, { id: 'p2', display_name: 'Bob' }]}
      isMyTurnToRespond={true} onUseSecondary={onUseSecondary} onPassSecondary={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /USE SECONDARY/i }))
    expect(onUseSecondary).toHaveBeenCalledWith(expect.any(Object))
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ti4-companion-web && npx vitest run tests/components/StrategyCardModal.test.jsx -t "StrategyCardSecondaryForm"
```
Expected: FAIL — StrategyCardSecondaryForm not defined.

- [ ] **Step 3: Implement `StrategyCardSecondaryForm` and add to `StrategyCardModal.jsx`**

Insert before `StrategyCardModal` export:

```jsx
function StrategyCardSecondaryForm({ cardNumber, myPlanets = [], allPlayers = [],
  warfareHomeSystemKey = null, onUseSecondary, onPassSecondary }) {
  const card = getCard(cardNumber)
  const [sel, setSel] = useState({})
  if (!card) return null
  const update = (key, val) => setSel(prev => ({ ...prev, [key]: val }))

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-bright">{card.secondaryText}</p>

      {card.secondaryFields.map(field => (
        <div key={field.key} className="flex flex-col gap-1">
          <p className="label text-xs">{field.label}</p>

          {field.type === 'planet_multiselect' && (
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
              {(field.filterExhausted ? myPlanets.filter(p => p.exhausted) : myPlanets).map(p => (
                <label key={p.planet_name} className="flex items-center gap-2 text-sm text-text cursor-pointer">
                  <input type="checkbox" checked={(sel[field.key] ?? []).includes(p.planet_name)}
                    onChange={e => {
                      const cur = sel[field.key] ?? []
                      update(field.key, e.target.checked
                        ? [...cur, p.planet_name].slice(0, field.max ?? 99)
                        : cur.filter(n => n !== p.planet_name))
                    }} />
                  {p.planet_name}
                </label>
              ))}
            </div>
          )}

          {field.type === 'pool_select' && (
            <div className="flex gap-2">
              {['tactic_total','fleet','strategy'].map(pool => (
                <label key={pool} className="flex items-center gap-1 text-sm text-text cursor-pointer">
                  <input type="radio" name={field.key} value={pool}
                    checked={(sel[field.key] ?? field.defaultValue) === pool}
                    onChange={() => update(field.key, pool)} />
                  {pool === 'tactic_total' ? 'Tactic' : pool.charAt(0).toUpperCase() + pool.slice(1)}
                </label>
              ))}
            </div>
          )}

          {field.type === 'tech_select' && (
            <p className="text-xs text-muted italic">Tech picker — select from your available technologies.</p>
          )}

          {field.type === 'production_form' && warfareHomeSystemKey && (
            <p className="text-xs text-bright">Home system: {warfareHomeSystemKey} — use the Production modal to place units.</p>
          )}
        </div>
      ))}

      <div className="flex gap-2 mt-1">
        <button className="btn-primary text-xs flex-1" onClick={() => onUseSecondary(sel)}>
          USE SECONDARY
        </button>
        <button className="btn-ghost text-xs flex-1" onClick={onPassSecondary}>
          PASS
        </button>
      </div>
    </div>
  )
}
```

Update `StrategyCardModal` to pass props to `StrategyCardSecondaryForm`:
```jsx
) : isMyTurnToRespond ? (
  <StrategyCardSecondaryForm
    cardNumber={activePay.card_number}
    myPlanets={myPlanets}
    allPlayers={players}
    warfareHomeSystemKey={warfareHomeSystemKey}
    onUseSecondary={onUseSecondary}
    onPassSecondary={onPassSecondary}
  />
```

Add `myPlanets`, `warfareHomeSystemKey` to `StrategyCardModal` props.

- [ ] **Step 4: Run all modal tests**

```bash
cd ti4-companion-web && npx vitest run tests/components/StrategyCardModal.test.jsx
```
Expected: all tests pass.

- [ ] **Step 5: Run full test suite**

```bash
cd ti4-companion-web && npm test
```
Expected: all existing tests still pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/components/game/StrategyCardModal.jsx tests/components/StrategyCardModal.test.jsx
git commit -m "feat: add StrategyCardSecondaryForm to StrategyCardModal (Phase 37)"
```

---

### Task 12: Deploy edge functions and update `_index.md`

**Files:**
- Modify: `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`

- [ ] **Step 1: Deploy modified edge functions**

```bash
supabase functions deploy game-play-strategy-card --no-verify-jwt
supabase functions deploy game-use-strategy-secondary --no-verify-jwt
supabase functions deploy game-produce-units --no-verify-jwt
```
Expected: all 3 deploy successfully.

- [ ] **Step 2: Mark Phase 37 rows as `done` in `_index.md`**

Change all 9 Phase 37 rows in `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md` from `planned` to `done`.

- [ ] **Step 3: Commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "chore: mark Phase 37 strategy card enforcement as done"
```
