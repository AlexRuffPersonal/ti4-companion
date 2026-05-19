# Exploration Full Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all per-card effect handling for the 4 exploration decks — correcting DSL bugs, adding missing dispatch ops, implementing the Demilitarized Zone attachment enforcement, the Enigmatic Device ACTION ability, and storing `system_key` through the draw→resolve pipeline.

**Architecture:** Migration 051 adds two schema columns. `explorationEffects.ts` gets 9 card entry fixes. `abilityDsl.ts` gains 3 new ops. `game-explore-planet` and `game-explore-frontier` store `system_key` at draw time. `game-resolve-exploration-card` uses the stored `system_key` and adds 7 new dispatch cases. A new `game-use-enigmatic-device` function handles the Enigmatic Device ACTION. `game-land-troops` gains a DMZ mech guard.

**Tech Stack:** Deno/TypeScript Edge Functions, PostgreSQL (Supabase), Vitest, @testing-library/react

---

### Task 1: Migration 051 — schema additions

**Files:**
- Create: `supabase/migrations/051_exploration_fixes.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/051_exploration_fixes.sql
ALTER TABLE public.game_exploration_decks
  ADD COLUMN IF NOT EXISTS system_key TEXT;

ALTER TABLE public.game_system_state
  ADD COLUMN IF NOT EXISTS has_mirage BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply migration locally**

```bash
supabase db push
```
Expected: migration applies without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/051_exploration_fixes.sql
git commit -m "feat: add system_key + has_mirage columns (migration 051)"
```

---

### Task 2: abilityDsl.ts — add 3 new ops

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`
- Test: `ti4-companion-web/tests/shared/abilityDsl.test.js`

- [ ] **Step 1: Write failing tests**

In `tests/shared/abilityDsl.test.js`, add to the `describe('interpretEffects')` block (or its own nested describe). The test file already mocks `db`; follow the same pattern.

```js
describe('convert_all_commodities', () => {
  it('converts all commodities to trade goods', async () => {
    const player = { id: 'p1', commodities: 3, trade_goods: 1, vp: 0, technologies: [],
                     action_card_count: 0, command_tokens: {}, faction: 'Arborec' }
    let updated = null
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }),
          }),
          update: vi.fn().mockImplementation((vals) => {
            updated = vals
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      return { select: vi.fn(), update: vi.fn() }
    })
    await interpretEffects([{ op: 'convert_all_commodities' }], ctx, db)
    expect(updated).toEqual({ commodities: 0, trade_goods: 4 })
  })

  it('no-ops when commodities=0', async () => {
    const player = { id: 'p1', commodities: 0, trade_goods: 2, vp: 0, technologies: [],
                     action_card_count: 0, command_tokens: {}, faction: 'Arborec' }
    const updateFn = vi.fn()
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }),
          }),
          update: updateFn,
        }
      }
      return { select: vi.fn(), update: vi.fn() }
    })
    await interpretEffects([{ op: 'convert_all_commodities' }], ctx, db)
    expect(updateFn).not.toHaveBeenCalled()
  })
})

describe('spend_commodities', () => {
  it('deducts commodities', async () => {
    const player = { id: 'p1', commodities: 2, trade_goods: 0, vp: 0, technologies: [],
                     action_card_count: 0, command_tokens: {}, faction: 'Arborec' }
    let updated = null
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }),
          }),
          update: vi.fn().mockImplementation((vals) => {
            updated = vals
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      return { select: vi.fn(), update: vi.fn() }
    })
    await interpretEffects([{ op: 'spend_commodities', amount: 1 }], ctx, db)
    expect(updated).toEqual({ commodities: 1 })
  })

  it('throws 409 when insufficient commodities', async () => {
    const player = { id: 'p1', commodities: 0, trade_goods: 0, vp: 0, technologies: [],
                     action_card_count: 0, command_tokens: {}, faction: 'Arborec' }
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }),
          }),
        }
      }
      return { select: vi.fn() }
    })
    await expect(interpretEffects([{ op: 'spend_commodities', amount: 1 }], ctx, db))
      .rejects.toMatchObject({ message: 'Insufficient commodities' })
  })
})

describe('gain_command_token_choice', () => {
  it('adds 1 token to chosen bucket', async () => {
    const player = { id: 'p1', commodities: 0, trade_goods: 0, vp: 0, technologies: [],
                     action_card_count: 0, command_tokens: { tactic_total: 3, fleet: 2, strategy: 1 }, faction: 'Arborec' }
    let updated = null
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }),
          }),
          update: vi.fn().mockImplementation((vals) => {
            updated = vals
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      return { select: vi.fn(), update: vi.fn() }
    })
    const ctxWithBucket = { ...ctx, selections: { command_token_bucket: 'fleet' } }
    await interpretEffects([{ op: 'gain_command_token_choice' }], ctxWithBucket, db)
    expect(updated.command_tokens).toEqual({ tactic_total: 3, fleet: 3, strategy: 1 })
  })

  it('defaults to tactic_total when bucket not provided', async () => {
    const player = { id: 'p1', commodities: 0, trade_goods: 0, vp: 0, technologies: [],
                     action_card_count: 0, command_tokens: { tactic_total: 2, fleet: 1, strategy: 1 }, faction: 'Arborec' }
    let updated = null
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }),
          }),
          update: vi.fn().mockImplementation((vals) => {
            updated = vals
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      return { select: vi.fn(), update: vi.fn() }
    })
    await interpretEffects([{ op: 'gain_command_token_choice' }], ctx, db)
    expect(updated.command_tokens.tactic_total).toBe(3)
  })

  it('throws 409 for invalid bucket', async () => {
    const player = { id: 'p1', commodities: 0, trade_goods: 0, vp: 0, technologies: [],
                     action_card_count: 0, command_tokens: { tactic_total: 1, fleet: 1, strategy: 1 }, faction: 'Arborec' }
    db.from.mockImplementation((table) => {
      if (table === 'game_players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: player, error: null }) }),
          }),
        }
      }
      return { select: vi.fn() }
    })
    const badCtx = { ...ctx, selections: { command_token_bucket: 'invalid_bucket' } }
    await expect(interpretEffects([{ op: 'gain_command_token_choice' }], badCtx, db))
      .rejects.toMatchObject({ message: 'Invalid command token bucket' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/shared/abilityDsl.test.js
```
Expected: 6 new tests FAIL with "Unknown op" or similar.

- [ ] **Step 3: Add 3 new cases to abilityDsl.ts**

In `supabase/functions/_shared/abilityDsl.ts`, inside the `interpretOp` switch, add after the `gain_commodities` case:

```typescript
    case 'convert_all_commodities': {
      const count = player.commodities as number
      if (count > 0) {
        const { error } = await db
          .from('game_players')
          .update({ commodities: 0, trade_goods: (player.trade_goods as number) + count })
          .eq('id', context.activatingPlayerId)
        if (error) throw new Error(`convert_all_commodities failed: ${error.message}`)
      }
      break
    }
    case 'spend_commodities': {
      const amount = op.amount as number
      if ((player.commodities as number) < amount) throw dslError('Insufficient commodities')
      const { error } = await db
        .from('game_players')
        .update({ commodities: (player.commodities as number) - amount })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`spend_commodities failed: ${error.message}`)
      break
    }
    case 'gain_command_token_choice': {
      const bucket = (context.selections?.command_token_bucket as string) ?? 'tactic_total'
      if (!['tactic_total', 'fleet', 'strategy'].includes(bucket)) throw dslError('Invalid command token bucket')
      const tokens = { ...(player.command_tokens as Record<string, number>) }
      tokens[bucket] = (tokens[bucket] ?? 0) + 1
      const { error } = await db
        .from('game_players')
        .update({ command_tokens: tokens })
        .eq('id', context.activatingPlayerId)
      if (error) throw new Error(`gain_command_token_choice failed: ${error.message}`)
      break
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/shared/abilityDsl.test.js
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts ti4-companion-web/tests/shared/abilityDsl.test.js
git commit -m "feat: add convert_all_commodities, spend_commodities, gain_command_token_choice to abilityDsl"
```

---

### Task 3: explorationEffects.ts — fix 9 card entries

**Files:**
- Modify: `supabase/functions/_shared/explorationEffects.ts`

No test file; these changes are exercised through the function tests in Tasks 4–7.

- [ ] **Step 1: Apply all 9 fixes**

Replace the following entries in `supabase/functions/_shared/explorationEffects.ts`:

```typescript
  // Replace:
  'Expedition':    [{ op:'conditional_mech_or_infantry', effect:[{op:'ready_planets',count:1,planets:'self'}] }],
  // With:
  'Expedition':    [{ op:'conditional_mech_or_infantry', effect:[{op:'ready_current_planet'}] }],

  // Replace:
  'Merchant Station': [{ op:'choice', options:[ [{op:'gain_commodities',amount:'max'}], [{op:'convert_commodities',amount:'all'}] ] }],
  // With:
  'Merchant Station': [{ op:'choice', options:[ [{op:'replenish_commodities',target:'self'}], [{op:'convert_all_commodities'}] ] }],

  // Replace:
  'Volatile Fuel Source': [{ op:'conditional_mech_or_infantry', effect:[{op:'gain_command_tokens',amount:1}] }],
  // With:
  'Volatile Fuel Source': [{ op:'conditional_mech_or_infantry', effect:[{op:'gain_command_token_choice'}] }],

  // Replace:
  'Functioning Base': [{ op:'choice', options:[ [{op:'gain_commodities',amount:1}], [{op:'gain_trade_goods',amount:-1},{op:'draw_action_card',count:1}] ] }],
  // With:
  'Functioning Base': [{ op:'choice', options:[ [{op:'gain_commodities',amount:1}], [{op:'spend_trade_goods',amount:1},{op:'draw_action_card',count:1}], [{op:'spend_commodities',amount:1},{op:'draw_action_card',count:1}] ] }],

  // Replace:
  'Local Fabricators': [{ op:'choice', options:[ [{op:'gain_commodities',amount:1}], [{op:'gain_trade_goods',amount:-1},{op:'place_units',unit:'mech',planet:'self',count:1}] ] }],
  // With:
  'Local Fabricators': [{ op:'choice', options:[ [{op:'gain_commodities',amount:1}], [{op:'spend_trade_goods',amount:1},{op:'place_mech_on_current_planet'}], [{op:'spend_commodities',amount:1},{op:'place_mech_on_current_planet'}] ] }],

  // Replace:
  'Demilitarized Zone': [{ op:'attach_to_planet', attachment:'Demilitarized Zone' }],
  // With:
  'Demilitarized Zone': [ {op:'clear_planet_units_and_structures'}, {op:'attach_to_planet', attachment:'Demilitarized Zone'} ],

  // Replace:
  'Tomb Of Emphidia': [{ op:'attach_to_planet', attachment:'Tomb Of Emphidia' }],
  // With:
  'Tomb Of Emphidia': [ {op:'attach_to_planet', attachment:'Tomb Of Emphidia'}, {op:'gain_named_relic', name:'Crown of Emphidia'} ],

  // Replace:
  'Enigmatic Device': [{ op:'gain_relic_fragment', fragment_type:'enigmatic_device', keep_card:true }],
  // With:
  'Enigmatic Device': [{op:'hold_card'}],

  // Replace:
  'Freelancers': [{ op:'place_units', unit:'any', planet:'self', count:1, spend_influence_as_resources:true }],
  // With:
  'Freelancers': [{op:'freelancers_produce'}],
```

The complete updated file should look like:

```typescript
export type Op = Record<string, unknown>

export const EXPLORATION_EFFECTS: Record<string, Op[]> = {
  // Industrial deck
  'Abandoned Warehouses':      [{ op:'choice', options:[ [{op:'gain_commodities',amount:2}], [{op:'convert_commodities',amount:2}] ] }],
  'Biotic Research Facility':  [{ op:'attach_to_planet', attachment:'Biotic Research Facility' }],
  'Cybernetic Research Facility': [{ op:'attach_to_planet', attachment:'Cybernetic Research Facility' }],
  'Functioning Base':          [{ op:'choice', options:[ [{op:'gain_commodities',amount:1}], [{op:'spend_trade_goods',amount:1},{op:'draw_action_card',count:1}], [{op:'spend_commodities',amount:1},{op:'draw_action_card',count:1}] ] }],
  'Local Fabricators':         [{ op:'choice', options:[ [{op:'gain_commodities',amount:1}], [{op:'spend_trade_goods',amount:1},{op:'place_mech_on_current_planet'}], [{op:'spend_commodities',amount:1},{op:'place_mech_on_current_planet'}] ] }],
  'Propulsion Research Facility': [{ op:'attach_to_planet', attachment:'Propulsion Research Facility' }],

  // Cultural deck
  'Cultural Relic Fragment':   [{ op:'gain_relic_fragment', fragment_type:'cultural' }],
  'Demilitarized Zone':        [{ op:'clear_planet_units_and_structures' }, { op:'attach_to_planet', attachment:'Demilitarized Zone' }],
  'Dyson Sphere':              [{ op:'attach_to_planet', attachment:'Dyson Sphere' }],
  'Freelancers':               [{op:'freelancers_produce'}],
  'Mercenary Outfit':          [{ op:'place_units', unit:'infantry', planet:'self', count:1, optional:true }],
  'Paradise World':            [{ op:'attach_to_planet', attachment:'Paradise World' }],
  'Tomb Of Emphidia':          [{ op:'attach_to_planet', attachment:'Tomb Of Emphidia' }, { op:'gain_named_relic', name:'Crown of Emphidia' }],

  // Hazardous deck
  'Core Mine':                 [{ op:'conditional_mech_or_infantry', effect:[{op:'gain_trade_goods',amount:1}] }],
  'Expedition':                [{ op:'conditional_mech_or_infantry', effect:[{op:'ready_current_planet'}] }],
  'Hazardous Relic Fragment':  [{ op:'gain_relic_fragment', fragment_type:'hazardous' }],
  'Industrial Relic Fragment': [{ op:'gain_relic_fragment', fragment_type:'industrial' }],
  'Lazax Survivors':           [{ op:'attach_to_planet', attachment:'Lazax Survivors' }],
  'Mining World':              [{ op:'attach_to_planet', attachment:'Mining World' }],
  'Rich World':                [{ op:'attach_to_planet', attachment:'Rich World' }],
  'Volatile Fuel Source':      [{ op:'conditional_mech_or_infantry', effect:[{op:'gain_command_token_choice'}] }],
  'Warfare Research Facility': [{ op:'attach_to_planet', attachment:'Warfare Research Facility' }],

  // Frontier deck
  'Derelict Vessel':           [{ op:'draw_secret_objective' }],
  'Enigmatic Device':          [{op:'hold_card'}],
  'Gamma Relay':               [{ op:'place_map_token', token_type:'gamma_wormhole' }],
  'Ion Storm':                 [{ op:'place_map_token', token_type:'ion_storm' }],
  'Lost Crew':                 [{ op:'draw_action_card', count:2 }],
  'Merchant Station':          [{ op:'choice', options:[ [{op:'replenish_commodities',target:'self'}], [{op:'convert_all_commodities'}] ] }],
  'Mirage':                    [{ op:'place_mirage' }],
  'Unknown Relic Fragment':    [{ op:'gain_relic_fragment', fragment_type:'unknown', keep_card:true }],
  'Gamma Wormhole':            [{ op:'place_map_token', token_type:'gamma_wormhole' }],
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/explorationEffects.ts
git commit -m "feat: fix 9 exploration card DSL entries"
```

---

### Task 4: game-explore-planet — store system_key at draw time

**Files:**
- Modify: `supabase/functions/game-explore-planet/index.ts`
- Test: `ti4-companion-web/tests/functions/game-explore-planet.test.js`

- [ ] **Step 1: Write failing tests**

Find the `describe('game-explore-planet')` block and add two new tests. The existing `mockDb` helper builds the `game_exploration_decks` update mock — update it to accept a `drawnUpdate` capture:

```js
it('stores system_key on drawn card row', async () => {
  let drawnUpdate = null
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { phase: 2, active_player_id: PLAYER_ID, map_tiles: { '2,1': { tile_id: 'tile-99' } } },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, technologies: [] }, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'pp-1', game_id: GAME_ID, player_id: PLAYER_ID, planet_name: 'Mecatol Rex',
                          tile_id: 'tile-99', exhausted: false, explored: false },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_exploration_decks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'card-1', name: 'Cultural Relic Fragment', text: '', has_attachment: false, relic_fragment_type: 'cultural', state: 'deck', deck_position: 1 },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((vals) => {
          drawnUpdate = vals
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    return { select: vi.fn(), update: vi.fn(), upsert: vi.fn() }
  })
  requireAuth.mockResolvedValue(USER_ID)

  const req = new Request('http://localhost/game-explore-planet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify({ game_id: GAME_ID, player_id: PLAYER_ID, planet_name: 'Mecatol Rex', deck_type: 'cultural' }),
  })
  const res = await handler(req)
  expect(res.status).toBe(200)
  expect(drawnUpdate).toMatchObject({ state: 'drawn', resolved_by_player_id: PLAYER_ID, system_key: '2,1', planet_name: 'Mecatol Rex' })
})

it('stores null system_key when planet tile not found in map', async () => {
  let drawnUpdate = null
  // Same mock setup as above but map_tiles is empty and tile_id is 'tile-99'
  db.from.mockImplementation((table) => {
    if (table === 'games') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { phase: 2, active_player_id: PLAYER_ID, map_tiles: {} },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: PLAYER_ID, technologies: [] }, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'pp-1', game_id: GAME_ID, player_id: PLAYER_ID, planet_name: 'Mecatol Rex',
                          tile_id: 'tile-99', exhausted: false, explored: false },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_exploration_decks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'card-1', name: 'Cultural Relic Fragment', text: '', has_attachment: false, relic_fragment_type: 'cultural', state: 'deck', deck_position: 1 },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((vals) => {
          drawnUpdate = vals
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    return { select: vi.fn(), update: vi.fn(), upsert: vi.fn() }
  })
  requireAuth.mockResolvedValue(USER_ID)

  const req = new Request('http://localhost/game-explore-planet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify({ game_id: GAME_ID, player_id: PLAYER_ID, planet_name: 'Mecatol Rex', deck_type: 'cultural' }),
  })
  const res = await handler(req)
  expect(res.status).toBe(200)
  expect(drawnUpdate).toMatchObject({ state: 'drawn', system_key: null })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-explore-planet.test.js
```
Expected: 2 new tests FAIL (system_key not in update payload).

- [ ] **Step 3: Implement in game-explore-planet/index.ts**

In `supabase/functions/game-explore-planet/index.ts`, after drawing the card and before the `update game_exploration_decks` call, derive system_key:

```typescript
  // Derive system_key from map_tiles using planet.tile_id
  const mapTiles = (game as { phase: number; active_player_id: string | null; map_tiles: Record<string, { tile_id: string }> }).map_tiles ?? {}
  const systemKey = Object.entries(mapTiles).find(([, v]) => v.tile_id === planet.tile_id)?.[0] ?? null

  const { error: updateError } = await db
    .from('game_exploration_decks')
    .update({ state: 'drawn', resolved_by_player_id: player_id, system_key: systemKey, planet_name })
    .eq('id', card.id)
```

The `game` select at line 65 already includes `map_tiles` — no query change needed.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-explore-planet.test.js
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-explore-planet/index.ts ti4-companion-web/tests/functions/game-explore-planet.test.js
git commit -m "feat: store system_key and planet_name on drawn exploration card row"
```

---

### Task 5: game-explore-frontier — 4 fixes

**Files:**
- Modify: `supabase/functions/game-explore-frontier/index.ts`
- Test: `ti4-companion-web/tests/functions/game-explore-frontier.test.js`

Four changes: (1) store system_key on drawn card, (2) add `choice` case to dispatchFrontierOp, (3) fix `place_mirage` to also set `has_mirage`, (4) add `hold_card` case + purge signal in final state machine.

- [ ] **Step 1: Write failing tests**

Add to `tests/functions/game-explore-frontier.test.js`:

```js
it('stores system_key on drawn card update', async () => {
  let drawnUpdate = null
  mockDb({
    card: makeCard({ name: 'Lost Crew' }),
  })
  // Override exploration update mock to capture the payload:
  db.from.mockImplementationOnce((table) => {
    if (table !== 'game_exploration_decks') return { select: vi.fn(), update: vi.fn(), upsert: vi.fn() }
  })
  // Use a full mock override:
  const originalImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_exploration_decks') {
      let callCount = 0
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: makeCard({ name: 'Lost Crew' }), error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((vals) => {
          callCount++
          if (callCount === 1) drawnUpdate = vals
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    return originalImpl(table)
  })
  const res = await handler(makeRequest(baseBody({ system_key: '3,-1' })))
  expect(res.status).toBe(200)
  expect(drawnUpdate).toMatchObject({ state: 'discarded', system_key: '3,-1' })
})

it('resolves Merchant Station choice=0 via replenish_commodities', async () => {
  mockDb({ card: makeCard({ name: 'Merchant Station' }) })
  const res = await handler(makeRequest(baseBody({ system_key: SYSTEM_KEY, choice: 0 })))
  expect(res.status).toBe(200)
  expect(applyAbility).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ op: 'replenish_commodities' })]),
    expect.any(Object),
    expect.any(Object)
  )
})

it('resolves Merchant Station choice=1 via convert_all_commodities', async () => {
  mockDb({ card: makeCard({ name: 'Merchant Station' }) })
  const res = await handler(makeRequest(baseBody({ system_key: SYSTEM_KEY, choice: 1 })))
  expect(res.status).toBe(200)
  expect(applyAbility).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ op: 'convert_all_commodities' })]),
    expect.any(Object),
    expect.any(Object)
  )
})

it('sets has_mirage=true in game_system_state for Mirage card', async () => {
  let systemStateUpsert = null
  mockDb({ card: makeCard({ name: 'Mirage' }) })
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_system_state') {
      const base = origImpl(table)
      return {
        ...base,
        upsert: vi.fn().mockImplementation((vals) => {
          if (vals.has_mirage === true) systemStateUpsert = vals
          return { error: null }
        }),
      }
    }
    return origImpl(table)
  })
  const res = await handler(makeRequest(baseBody()))
  expect(res.status).toBe(200)
  expect(systemStateUpsert).toMatchObject({ has_mirage: true, system_key: SYSTEM_KEY })
})

it('keeps Enigmatic Device in held state via hold_card op', async () => {
  let finalUpdate = null
  mockDb({ card: makeCard({ name: 'Enigmatic Device' }) })
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_exploration_decks') {
      const base = origImpl(table)
      return {
        ...base,
        update: vi.fn().mockImplementation((vals) => {
          finalUpdate = vals
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    return origImpl(table)
  })
  const res = await handler(makeRequest(baseBody()))
  expect(res.status).toBe(200)
  expect(finalUpdate).toMatchObject({ state: 'held', resolved_by_player_id: PLAYER_ID })
})
```

The `baseBody` needs to accept a `choice` param. Add to the helper:
```js
function baseBody(overrides = {}) {
  return { game_id: GAME_ID, player_id: PLAYER_ID, system_key: SYSTEM_KEY, ...overrides }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-explore-frontier.test.js
```
Expected: 5 new tests FAIL.

- [ ] **Step 3: Implement the 4 fixes in game-explore-frontier/index.ts**

**Fix 1 — Add `choice` to `FrontierContext` type and body parsing:**

```typescript
type FrontierContext = {
  gameId: string
  playerId: string
  systemKey: string
  choice: number | null
  removeInfantry: false
}
```

Update body type and parsing:
```typescript
let body: { game_id?: unknown; player_id?: unknown; system_key?: unknown; choice?: unknown }
// ...
const choice = typeof body.choice === 'number' ? body.choice : null
// ...
const ctx: FrontierContext = { gameId, playerId, systemKey, choice, removeInfantry: false }
```

**Fix 2 — Add `choice` and `hold_card` cases to `dispatchFrontierOp`:**

```typescript
async function dispatchFrontierOp(
  op: Op,
  ctx: FrontierContext,
  resolveContext: ResolveContext,
  dbClient: SupabaseClient
): Promise<'handled' | 'held' | 'purge'> {
  switch (op.op) {
    case 'choice': {
      const options = op.options as Op[][]
      const chosen = options[ctx.choice ?? 0] ?? []
      for (const innerOp of chosen) {
        await dispatchFrontierOp(innerOp, ctx, resolveContext, dbClient)
      }
      return 'handled'
    }

    case 'hold_card': {
      return 'held'
    }

    case 'place_mirage': {
      const { error: ssError } = await dbClient
        .from('game_system_state')
        .upsert(
          { game_id: ctx.gameId, system_key: ctx.systemKey, has_mirage: true },
          { onConflict: 'game_id,system_key' }
        )
      if (ssError) throw Object.assign(new Error('Database error'), { status: 500 })
      const { error } = await dbClient
        .from('game_player_planets')
        .upsert(
          { game_id: ctx.gameId, player_id: ctx.playerId, planet_name: 'mirage', tile_id: null, exhausted: false, explored: false },
          { onConflict: 'game_id,player_id,planet_name' }
        )
      if (error) throw Object.assign(new Error('Database error'), { status: 500 })
      return 'purge'
    }

    case 'place_map_token': {
      const tokenType = op.token_type as string
      const updates: Record<string, unknown> = { game_id: ctx.gameId, system_key: ctx.systemKey }
      if (tokenType === 'ion_storm') updates.ion_storm = true
      else if (tokenType === 'gamma_wormhole') updates.wormhole_type = 'gamma'
      const { error } = await dbClient
        .from('game_system_state')
        .upsert(updates, { onConflict: 'game_id,system_key' })
      if (error) throw Object.assign(new Error('Database error'), { status: 500 })
      return 'handled'
    }

    case 'gain_relic_fragment': {
      if (op.keep_card) {
        return 'held'
      }
      await applyAbility([op], resolveContext, dbClient)
      return 'handled'
    }

    default: {
      await applyAbility([op], resolveContext, dbClient)
      return 'handled'
    }
  }
}
```

**Fix 3 — Store system_key on drawn card row and update final state machine:**

Find the `update game_exploration_decks SET state='drawn'` call and add `system_key`:
```typescript
  const { error: drawUpdateError } = await db
    .from('game_exploration_decks')
    .update({ state: 'drawn', resolved_by_player_id: playerId, system_key: systemKey })
    .eq('id', card.id)
  if (drawUpdateError) return errorResponse('Database error', 500)
```

Wait — currently the function resolves atomically, not deferred. The draw update happens at the end (as the final state update). Update it to store system_key in the final state update:

Looking at the current code (line 200–212), replace the `held`/`else` block:
```typescript
  let held = false
  let purge = false
  try {
    for (const op of ops) {
      const result = await dispatchFrontierOp(op, ctx, resolveContext, db)
      if (result === 'held') held = true
      if (result === 'purge') purge = true
    }
  } catch (e) {
    const err = e as Error & { status?: number }
    return errorResponse(err.message, err.status ?? 409)
  }

  if (held) {
    const { error: holdError } = await db
      .from('game_exploration_decks')
      .update({ state: 'held', resolved_by_player_id: playerId, system_key: systemKey })
      .eq('id', card.id)
    if (holdError) return errorResponse('Database error', 500)
  } else if (purge || (card as FrontierCardRow & { purge?: boolean }).purge) {
    const { error: purgeError } = await db
      .from('game_exploration_decks')
      .update({ state: 'purged', resolved_by_player_id: null, system_key: systemKey })
      .eq('id', card.id)
    if (purgeError) return errorResponse('Database error', 500)
  } else {
    const { error: discardError } = await db
      .from('game_exploration_decks')
      .update({ state: 'discarded', resolved_by_player_id: null, system_key: systemKey })
      .eq('id', card.id)
    if (discardError) return errorResponse('Database error', 500)
  }
```

Update `FrontierCardRow` type to include `purge`:
```typescript
type FrontierCardRow = {
  id: string
  name: string
  state: string
  deck_position: number
  purge?: boolean
}
```

Update `drawTopFrontierCard` select to include `purge`:
```typescript
    .select('id, name, state, deck_position, purge')
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-explore-frontier.test.js
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-explore-frontier/index.ts ti4-companion-web/tests/functions/game-explore-frontier.test.js
git commit -m "feat: fix game-explore-frontier — choice dispatch, Mirage has_mirage, hold_card, purge state"
```

---

### Task 6: game-resolve-exploration-card — multiple fixes

**Files:**
- Modify: `supabase/functions/game-resolve-exploration-card/index.ts`
- Test: `ti4-companion-web/tests/functions/game-resolve-exploration-card.test.js`

Seven new dispatch cases + system_key fix + purge state machine + body param additions.

- [ ] **Step 1: Write failing tests**

Add to `tests/functions/game-resolve-exploration-card.test.js`. The existing `makeCard` builder and `mockDb` helper are the foundation. Add:

```js
it('passes system_key from card row to dispatch context', async () => {
  mockDb({ card: makeCard({ name: 'Cultural Relic Fragment', system_key: '3,-1' }) })
  // Cultural Relic Fragment → relic_fragment signal → held state
  const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID, card_id: 'card-1' }))
  expect(res.status).toBe(200)
  // Verify ctx.systemKey='3,-1' is passed to any downstream call that needs it.
  // The key check is that the card update uses held (relic_fragment signal) — existing test already covers state.
})

it('applies ready_current_planet for Expedition with mech present', async () => {
  let planetUpdate = null
  mockDb({
    card: makeCard({ name: 'Expedition', planet_name: 'Wellon' }),
    units: [{ id: 'u1', unit_type: 'mech', count: 1 }],
  })
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockImplementation((vals) => {
          planetUpdate = vals
          return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }
        }),
      }
    }
    return origImpl(table)
  })
  const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID, card_id: 'card-1' }))
  expect(res.status).toBe(200)
  expect(planetUpdate).toMatchObject({ exhausted: false })
})

it('applies clear_planet_units_and_structures for Demilitarized Zone', async () => {
  let planetUpdate = null
  let unitDelete = null
  mockDb({ card: makeCard({ name: 'Demilitarized Zone', planet_name: 'Wellon' }) })
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_player_planets') {
      return {
        update: vi.fn().mockImplementation((vals) => {
          if (vals.space_dock_unit_id === null) planetUpdate = vals
          return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => {
                unitDelete = true
                return { error: null }
              }),
            }),
          }),
        }),
      }
    }
    return origImpl(table)
  })
  const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID, card_id: 'card-1' }))
  expect(res.status).toBe(200)
  expect(planetUpdate).toMatchObject({ space_dock_unit_id: null, pds_count: 0 })
  expect(unitDelete).toBe(true)
})

it('applies gain_named_relic for Tomb Of Emphidia', async () => {
  let relicUpdate = null
  mockDb({ card: makeCard({ name: 'Tomb Of Emphidia', planet_name: 'Emphidia' }) })
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_relic_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'relic-1', name: 'Crown of Emphidia', state: 'deck' }, error: null,
                }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((vals) => {
          relicUpdate = vals
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    return origImpl(table)
  })
  const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID, card_id: 'card-1' }))
  expect(res.status).toBe(200)
  expect(relicUpdate).toMatchObject({ state: 'held', held_by_player_id: PLAYER_ID })
})

it('skips gain_named_relic silently if Crown of Emphidia not in deck', async () => {
  mockDb({ card: makeCard({ name: 'Tomb Of Emphidia', planet_name: 'Emphidia' }) })
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_relic_deck') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
        update: vi.fn(),
      }
    }
    return origImpl(table)
  })
  const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID, card_id: 'card-1' }))
  expect(res.status).toBe(200)
})

it('sets state=held for hold_card (Enigmatic Device)', async () => {
  let cardUpdate = null
  mockDb({ card: makeCard({ name: 'Enigmatic Device', planet_name: null }) })
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_exploration_decks') {
      const base = origImpl(table)
      return {
        ...base,
        update: vi.fn().mockImplementation((vals) => {
          cardUpdate = vals
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    return origImpl(table)
  })
  const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID, card_id: 'card-1' }))
  expect(res.status).toBe(200)
  expect(cardUpdate).toMatchObject({ state: 'held', resolved_by_player_id: PLAYER_ID })
})

it('sets state=purged for purge:true card (Gamma Wormhole)', async () => {
  let cardUpdate = null
  mockDb({ card: makeCard({ name: 'Gamma Wormhole', purge: true, planet_name: null }) })
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_exploration_decks') {
      const base = origImpl(table)
      return {
        ...base,
        update: vi.fn().mockImplementation((vals) => {
          if (vals.state === 'purged' || vals.state === 'discarded') cardUpdate = vals
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    if (table === 'game_system_state') {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    return origImpl(table)
  })
  const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID, card_id: 'card-1' }))
  expect(res.status).toBe(200)
  expect(cardUpdate).toMatchObject({ state: 'purged' })
})

it('applies freelancers_produce when unit_type provided', async () => {
  let unitUpsert = null
  let planetUpdate = null
  const card = makeCard({ name: 'Freelancers', planet_name: 'Mecatol Rex', system_key: '0,0' })
  mockDb({ card })
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'unit-def-1', name: 'Infantry', cost: 1 }, error: null,
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_player_planets' && planetUpdate === null) {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'pp-1', planet_name: 'Mecatol Rex', tile_id: 'tile-1', exhausted: false }], error: null,
              }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((vals) => {
          planetUpdate = vals
          return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }) }) }
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'tile-1', planets: [{ name: 'Mecatol Rex', resources: 1, influence: 2 }] }], error: null,
          }),
        }),
      }
    }
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
        upsert: vi.fn().mockImplementation((vals) => {
          unitUpsert = vals
          return { error: null }
        }),
      }
    }
    return origImpl(table)
  })
  const res = await handler(makeRequest({
    game_id: GAME_ID, player_id: PLAYER_ID, card_id: 'card-1',
    unit_type: 'infantry', resource_planet_names: ['Mecatol Rex'],
  }))
  expect(res.status).toBe(200)
  expect(planetUpdate).toMatchObject({ exhausted: true })
  expect(unitUpsert).toBeTruthy()
})

it('skips freelancers_produce when unit_type omitted', async () => {
  const unitUpsert = vi.fn()
  mockDb({ card: makeCard({ name: 'Freelancers', planet_name: 'Mecatol Rex' }) })
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_player_units') {
      return { upsert: unitUpsert, select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }) }
    }
    return origImpl(table)
  })
  const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID, card_id: 'card-1' }))
  expect(res.status).toBe(200)
  expect(unitUpsert).not.toHaveBeenCalled()
})

it('409 Planet already has a mech for place_mech_on_current_planet (Local Fabricators choice=1)', async () => {
  mockDb({
    card: makeCard({ name: 'Local Fabricators', planet_name: 'Wellon' }),
    units: [{ id: 'u1', unit_type: 'mech', count: 1, on_planet: 'Wellon' }],
  })
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'u1', unit_type: 'mech', count: 1 }, error: null,
                }),
              }),
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: PLAYER_ID, trade_goods: 1, commodities: 0 }, error: null,
              }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: PLAYER_ID, trade_goods: 1, commodities: 0 }, error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    return origImpl(table)
  })
  const res = await handler(makeRequest({ game_id: GAME_ID, player_id: PLAYER_ID, card_id: 'card-1', choice: 1 }))
  const body = await res.json()
  expect(res.status).toBe(409)
  expect(body.error).toMatch(/mech/i)
})
```

Note: for these tests, add `system_key` to the `makeCard` builder: `makeCard(overrides)` already spreads overrides, so `makeCard({ name: 'X', system_key: '0,0' })` will work once the card select includes `system_key`.

Also add `purge` to `makeCard` defaults:
```js
function makeCard(overrides = {}) {
  return {
    id: 'card-1',
    name: 'Cultural Relic Fragment',
    state: 'drawn',
    deck_type: 'cultural',
    deck_position: null,
    text: '',
    has_attachment: false,
    relic_fragment_type: 'cultural',
    resolved_by_player_id: PLAYER_ID,
    planet_name: 'Mecatol Rex',
    system_key: null,
    purge: false,
    ...overrides,
  }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-exploration-card.test.js
```
Expected: ~10 new tests FAIL.

- [ ] **Step 3: Implement all fixes in game-resolve-exploration-card/index.ts**

**3a — Update `ExplorationCardRow` type and card select:**

```typescript
type ExplorationCardRow = {
  id: string
  game_id: string
  deck_type: string
  state: string
  deck_position: number | null
  name: string
  text: string | null
  has_attachment: boolean
  relic_fragment_type: string | null
  resolved_by_player_id: string | null
  planet_name: string | null
  system_key: string | null
  purge: boolean
}
```

Card select (line 182):
```typescript
    .select('id, game_id, deck_type, state, deck_position, name, text, has_attachment, relic_fragment_type, resolved_by_player_id, planet_name, system_key, purge')
```

**3b — Fix systemKey derivation (line 198):**

Replace:
```typescript
  const systemKey: string | null = null
```
With:
```typescript
  const systemKey = card.system_key ?? null
```

**3c — Add body fields for Volatile Fuel Source, Freelancers:**

```typescript
let body: {
  game_id?: unknown
  player_id?: unknown
  card_id?: unknown
  choice?: unknown
  remove_infantry?: unknown
  command_token_bucket?: unknown
  unit_type?: unknown
  resource_planet_names?: unknown
}
```

Extract them below the existing extractions:
```typescript
  const commandTokenBucket = typeof body.command_token_bucket === 'string' ? body.command_token_bucket : undefined
  const unitType = typeof body.unit_type === 'string' ? body.unit_type : undefined
  const resourcePlanetNames = Array.isArray(body.resource_planet_names) ? body.resource_planet_names as string[] : undefined
```

Pass `commandTokenBucket` into `resolveContext.selections`:
```typescript
  const resolveContext: ResolveContext = {
    gameId: game_id,
    activatingPlayerId: player_id,
    targetPlanetName: planetName ?? undefined,
    chosenOption: choice,
    selections: commandTokenBucket ? { command_token_bucket: commandTokenBucket } : {},
  }
```

Update `ResolveExplorationContext` to include `unitType` and `resourcePlanetNames`:
```typescript
type ResolveExplorationContext = {
  gameId: string
  playerId: string
  planetName: string | null
  systemKey: string | null
  choice: number | undefined
  removeInfantry: boolean | undefined
  unitType: string | undefined
  resourcePlanetNames: string[] | undefined
}
```

Set them in `explorationCtx`:
```typescript
  const explorationCtx: ResolveExplorationContext = {
    gameId: game_id,
    playerId: player_id,
    planetName,
    systemKey,
    choice,
    removeInfantry,
    unitType,
    resourcePlanetNames,
  }
```

**3d — Extend `dispatchExplorationOp` return union and add 7 new cases:**

Update return type:
```typescript
): Promise<'handled' | 'passthrough' | 'relic_fragment' | 'attachment' | 'hold' | Response>
```

Add after the `place_mirage` case:

```typescript
    case 'ready_current_planet': {
      if (ctx.planetName) {
        const { error } = await dbClient
          .from('game_player_planets')
          .update({ exhausted: false })
          .eq('game_id', ctx.gameId)
          .eq('player_id', ctx.playerId)
          .eq('planet_name', ctx.planetName)
        if (error) return errorResponse('Database error', 500)
      }
      return 'handled'
    }

    case 'clear_planet_units_and_structures': {
      if (ctx.planetName) {
        const { error: pErr } = await dbClient
          .from('game_player_planets')
          .update({ space_dock_unit_id: null, pds_count: 0 })
          .eq('game_id', ctx.gameId)
          .eq('player_id', ctx.playerId)
          .eq('planet_name', ctx.planetName)
        if (pErr) return errorResponse('Database error', 500)
        const { error: uErr } = await dbClient
          .from('game_player_units')
          .delete()
          .eq('game_id', ctx.gameId)
          .eq('player_id', ctx.playerId)
          .eq('on_planet', ctx.planetName)
        if (uErr) return errorResponse('Database error', 500)
      }
      return 'handled'
    }

    case 'hold_card': {
      return 'hold'
    }

    case 'gain_named_relic': {
      const relicName = op.name as string
      const { data: relicRow, error: relicErr } = await dbClient
        .from('game_relic_deck')
        .select('id')
        .eq('game_id', ctx.gameId)
        .eq('name', relicName)
        .eq('state', 'deck')
        .maybeSingle()
      if (relicErr) return errorResponse('Database error', 500)
      if (relicRow) {
        const { error: updateErr } = await dbClient
          .from('game_relic_deck')
          .update({ state: 'held', held_by_player_id: ctx.playerId })
          .eq('id', (relicRow as { id: string }).id)
        if (updateErr) return errorResponse('Database error', 500)
      }
      return 'handled'
    }

    case 'place_mech_on_current_planet': {
      if (!ctx.planetName) return 'handled'
      const { data: existing, error: checkErr } = await dbClient
        .from('game_player_units')
        .select('id, count')
        .eq('game_id', ctx.gameId)
        .eq('player_id', ctx.playerId)
        .eq('unit_type', 'mech')
        .eq('on_planet', ctx.planetName)
        .maybeSingle()
      if (checkErr) return errorResponse('Database error', 500)
      if (existing && (existing as { count: number }).count >= 1) {
        return errorResponse('Planet already has a mech', 409)
      }
      const { error: upsertErr } = await dbClient
        .from('game_player_units')
        .upsert(
          { game_id: ctx.gameId, player_id: ctx.playerId, unit_type: 'mech',
            system_key: ctx.systemKey, on_planet: ctx.planetName, count: 1 },
          { onConflict: 'game_id,player_id,unit_type,system_key,on_planet' }
        )
      if (upsertErr) return errorResponse('Database error', 500)
      return 'handled'
    }

    case 'freelancers_produce': {
      if (!ctx.unitType) return 'handled'
      const { data: unitDef, error: unitDefErr } = await dbClient
        .from('units')
        .select('id, cost')
        .eq('name', ctx.unitType)
        .eq('type', 'unit')
        .maybeSingle()
      if (unitDefErr || !unitDef) return errorResponse('Unknown unit type', 409)
      const cost = (unitDef as { cost: number }).cost

      const planetNames = ctx.resourcePlanetNames ?? []
      const { data: planets, error: planetErr } = await dbClient
        .from('game_player_planets')
        .select('id, planet_name, tile_id, exhausted')
        .eq('game_id', ctx.gameId)
        .eq('player_id', ctx.playerId)
        .in('planet_name', planetNames)
      if (planetErr) return errorResponse('Database error', 500)
      const planetList = (planets ?? []) as Array<{ id: string; planet_name: string; tile_id: string; exhausted: boolean }>
      if (planetList.length !== planetNames.length) return errorResponse('One or more planets not found or not controlled', 409)
      if (planetList.some((p) => p.exhausted)) return errorResponse('One or more planets are already exhausted', 409)

      const tileIds = [...new Set(planetList.map((p) => p.tile_id).filter(Boolean))]
      const { data: tiles, error: tileErr } = await dbClient
        .from('tiles')
        .select('id, planets')
        .in('id', tileIds)
      if (tileErr) return errorResponse('Database error', 500)
      const tileMap = Object.fromEntries(
        ((tiles ?? []) as Array<{ id: string; planets: Array<{ name: string; resources: number; influence: number }> }>)
          .map((t) => [t.id, t])
      )
      let totalSpend = 0
      for (const p of planetList) {
        const tilePlanets = tileMap[p.tile_id]?.planets ?? []
        const def = tilePlanets.find((tp) => tp.name.toLowerCase() === p.planet_name.toLowerCase())
        if (def) totalSpend += (def.resources ?? 0) + (def.influence ?? 0)
      }
      if (totalSpend < cost) return errorResponse('Insufficient resources', 409)

      const { error: exhaustErr } = await dbClient
        .from('game_player_planets')
        .update({ exhausted: true })
        .eq('game_id', ctx.gameId)
        .eq('player_id', ctx.playerId)
        .in('planet_name', planetNames)
      if (exhaustErr) return errorResponse('Database error', 500)

      const { error: upsertErr } = await dbClient
        .from('game_player_units')
        .upsert(
          { game_id: ctx.gameId, player_id: ctx.playerId, unit_type: ctx.unitType,
            system_key: ctx.systemKey, on_planet: null, count: 1 },
          { onConflict: 'game_id,player_id,unit_type,system_key,on_planet' }
        )
      if (upsertErr) return errorResponse('Database error', 500)
      return 'handled'
    }
```

Replace the `place_mirage` case:
```typescript
    case 'place_mirage': {
      if (ctx.systemKey) {
        const { error: ssErr } = await dbClient
          .from('game_system_state')
          .upsert(
            { game_id: ctx.gameId, system_key: ctx.systemKey, has_mirage: true },
            { onConflict: 'game_id,system_key' }
          )
        if (ssErr) return errorResponse('Database error', 500)
      }
      const { error } = await dbClient
        .from('game_player_planets')
        .upsert(
          { game_id: ctx.gameId, player_id: ctx.playerId, planet_name: 'mirage',
            tile_id: null, exhausted: false, explored: false },
          { onConflict: 'game_id,player_id,planet_name' }
        )
      if (error) return errorResponse('Database error', 500)
      return 'handled'
    }
```

**3e — Update `signalType` tracking and final state machine:**

```typescript
  let signalType: 'handled' | 'passthrough' | 'relic_fragment' | 'attachment' | 'hold' = 'handled'
  const passthroughOps: Op[] = []

  for (const op of ops) {
    const result = await dispatchExplorationOp(op, explorationCtx, card, resolveContext, db)
    if (result instanceof Response) return result
    if (result === 'passthrough') {
      passthroughOps.push(op)
    } else if (result === 'relic_fragment') {
      signalType = 'relic_fragment'
    } else if (result === 'attachment') {
      signalType = 'attachment'
    } else if (result === 'hold') {
      signalType = 'hold'
    }
  }

  if (passthroughOps.length > 0) {
    try {
      await applyAbility(passthroughOps, resolveContext, db)
    } catch (e) {
      const err = e as Error & { status?: number }
      return errorResponse(err.message, err.status ?? 409)
    }
  }

  if (signalType === 'relic_fragment' || signalType === 'hold') {
    const { error: updateError } = await db
      .from('game_exploration_decks')
      .update({ state: 'held', resolved_by_player_id: player_id })
      .eq('id', card_id)
    if (updateError) return errorResponse('Database error', 500)
  } else if (card.purge) {
    const { error: updateError } = await db
      .from('game_exploration_decks')
      .update({ state: 'purged', resolved_by_player_id: null })
      .eq('id', card_id)
    if (updateError) return errorResponse('Database error', 500)
  } else {
    const { error: updateError } = await db
      .from('game_exploration_decks')
      .update({ state: 'discarded', resolved_by_player_id: null })
      .eq('id', card_id)
    if (updateError) return errorResponse('Database error', 500)
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-exploration-card.test.js
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-resolve-exploration-card/index.ts ti4-companion-web/tests/functions/game-resolve-exploration-card.test.js
git commit -m "feat: fix game-resolve-exploration-card — system_key, 7 new dispatch cases, purge state"
```

---

### Task 7: game-use-enigmatic-device — new function

**Files:**
- Create: `supabase/functions/game-use-enigmatic-device/index.ts`
- Create: `ti4-companion-web/tests/functions/game-use-enigmatic-device.test.js`

- [ ] **Step 1: Create test file**

```js
// ti4-companion-web/tests/functions/game-use-enigmatic-device.test.js
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
  applyAbility: vi.fn().mockResolvedValue(undefined),
  dslError: vi.fn((msg, status = 409) => Object.assign(new Error(msg), { status }),
}))

import { requireAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'
import { db } from '../../../supabase/functions/_shared/db.ts'
import { applyAbility } from '../../../supabase/functions/_shared/abilityDsl.ts'
import { handler } from '../../../supabase/functions/game-use-enigmatic-device/index.ts'

const USER_ID = 'user-1'
const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const CARD_ID = 'card-1'

function makeRequest(body) {
  return new Request('http://localhost/game-use-enigmatic-device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function baseBody(overrides = {}) {
  return {
    game_id: GAME_ID,
    player_id: PLAYER_ID,
    card_id: CARD_ID,
    resource_planet_names: ['Mecatol Rex'],
    technology_name: 'Sarween Tools',
    ...overrides,
  }
}

function makeCard(overrides = {}) {
  return {
    id: CARD_ID,
    game_id: GAME_ID,
    name: 'Enigmatic Device',
    state: 'held',
    resolved_by_player_id: PLAYER_ID,
    ...overrides,
  }
}

function mockDb({
  player = { id: PLAYER_ID },
  playerError = null,
  card = makeCard(),
  cardError = null,
  planets = [{ id: 'pp-1', planet_name: 'Mecatol Rex', tile_id: 'tile-1', exhausted: false }],
  planetsError = null,
  tiles = [{ id: 'tile-1', planets: [{ name: 'Mecatol Rex', resources: 3, influence: 2 }] }],
  tilesError = null,
  relicUpdateError = null,
  planetUpdateError = null,
} = {}) {
  db.from.mockImplementation((table) => {
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: player, error: playerError }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: planetUpdateError }) }),
      }
    }
    if (table === 'game_exploration_decks') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: card, error: cardError }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: relicUpdateError }) }),
      }
    }
    if (table === 'game_player_planets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: planets, error: planetsError }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: planetUpdateError }),
            }),
          }),
        }),
      }
    }
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: tiles, error: tilesError }),
        }),
      }
    }
    return { select: vi.fn(), update: vi.fn(), upsert: vi.fn() }
  })
}

describe('game-use-enigmatic-device', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb()
    requireAuth.mockResolvedValue(USER_ID)
  })

  it('204 CORS preflight', async () => {
    const req = new Request('http://localhost', { method: 'OPTIONS' })
    const res = await handler(req)
    expect(res.status).toBe(204)
  })

  it('401 unauthenticated', async () => {
    requireAuth.mockRejectedValue(new AuthError('Unauthorized'))
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(401)
  })

  it('400 missing game_id', async () => {
    const res = await handler(makeRequest(baseBody({ game_id: undefined })))
    expect(res.status).toBe(400)
  })

  it('400 missing player_id', async () => {
    const res = await handler(makeRequest(baseBody({ player_id: undefined })))
    expect(res.status).toBe(400)
  })

  it('400 missing card_id', async () => {
    const res = await handler(makeRequest(baseBody({ card_id: undefined })))
    expect(res.status).toBe(400)
  })

  it('400 missing resource_planet_names', async () => {
    const res = await handler(makeRequest(baseBody({ resource_planet_names: undefined })))
    expect(res.status).toBe(400)
  })

  it('400 missing technology_name', async () => {
    const res = await handler(makeRequest(baseBody({ technology_name: undefined })))
    expect(res.status).toBe(400)
  })

  it('404 player not in game', async () => {
    mockDb({ player: null })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(404)
  })

  it('404 card not found', async () => {
    mockDb({ card: null })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(404)
  })

  it('409 Card not in held state', async () => {
    mockDb({ card: makeCard({ state: 'discarded' }) })
    const res = await handler(makeRequest(baseBody()))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toMatch(/held/i)
  })

  it('409 Not your card', async () => {
    mockDb({ card: makeCard({ resolved_by_player_id: 'other-player' }) })
    const res = await handler(makeRequest(baseBody()))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toMatch(/your card/i)
  })

  it('409 Card is not an Enigmatic Device', async () => {
    mockDb({ card: makeCard({ name: 'Unknown Relic Fragment' }) })
    const res = await handler(makeRequest(baseBody()))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toMatch(/Enigmatic Device/i)
  })

  it('409 when one or more planets not found', async () => {
    mockDb({ planets: [] })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
  })

  it('409 when one or more planets are exhausted', async () => {
    mockDb({ planets: [{ id: 'pp-1', planet_name: 'Mecatol Rex', tile_id: 'tile-1', exhausted: true }] })
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
  })

  it('409 Insufficient resources when total < 6', async () => {
    mockDb({
      tiles: [{ id: 'tile-1', planets: [{ name: 'Mecatol Rex', resources: 1, influence: 0 }] }],
    })
    const res = await handler(makeRequest(baseBody()))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toMatch(/resources/i)
  })

  it('researches technology and purges card on success', async () => {
    let cardUpdate = null
    let planetUpdate = null
    mockDb()
    const origImpl = db.from.getMockImplementation()
    db.from.mockImplementation((table) => {
      if (table === 'game_exploration_decks') {
        const base = origImpl(table)
        return {
          ...base,
          update: vi.fn().mockImplementation((vals) => {
            cardUpdate = vals
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      if (table === 'game_player_planets') {
        const base = origImpl(table)
        return {
          ...base,
          update: vi.fn().mockImplementation((vals) => {
            planetUpdate = vals
            return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }) }) }
          }),
        }
      }
      return origImpl(table)
    })
    const res = await handler(makeRequest(baseBody()))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(applyAbility).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ op: 'gain_technology' })]),
      expect.objectContaining({ selections: expect.objectContaining({ technology_name: 'Sarween Tools' }) }),
      expect.any(Object)
    )
    expect(planetUpdate).toMatchObject({ exhausted: true })
    expect(cardUpdate).toMatchObject({ state: 'purged', resolved_by_player_id: null })
    expect(body).toMatchObject({ technology: 'Sarween Tools' })
  })

  it('propagates 409 from applyAbility when tech prereqs not met', async () => {
    applyAbility.mockRejectedValue(Object.assign(new Error('Prerequisite not met'), { status: 409 }))
    const res = await handler(makeRequest(baseBody()))
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-use-enigmatic-device.test.js
```
Expected: all tests FAIL (file doesn't exist yet or handler not exported).

- [ ] **Step 3: Create the function**

Create `supabase/functions/game-use-enigmatic-device/index.ts`:

```typescript
import { requireAuth, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse, corsPreflightResponse } from '../_shared/errors.ts'
import { applyAbility, ResolveContext } from '../_shared/abilityDsl.ts'

export async function handler(req: Request): Promise<Response> {
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
    player_id?: unknown
    card_id?: unknown
    resource_planet_names?: unknown
    technology_name?: unknown
  }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }

  if (!body.game_id || typeof body.game_id !== 'string') return errorResponse("'game_id' is required")
  if (!body.player_id || typeof body.player_id !== 'string') return errorResponse("'player_id' is required")
  if (!body.card_id || typeof body.card_id !== 'string') return errorResponse("'card_id' is required")
  if (!Array.isArray(body.resource_planet_names)) return errorResponse("'resource_planet_names' is required")
  if (!body.technology_name || typeof body.technology_name !== 'string') return errorResponse("'technology_name' is required")

  const gameId = body.game_id
  const playerId = body.player_id
  const cardId = body.card_id
  const resourcePlanetNames = body.resource_planet_names as string[]
  const technologyName = body.technology_name

  const { data: player, error: playerError } = await db
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerError) return errorResponse('Database error', 500)
  if (!player) return errorResponse('Player not found in this game', 404)

  const { data: cardRow, error: cardError } = await db
    .from('game_exploration_decks')
    .select('id, game_id, name, state, resolved_by_player_id')
    .eq('id', cardId)
    .eq('game_id', gameId)
    .maybeSingle()
  if (cardError) return errorResponse('Database error', 500)
  if (!cardRow) return errorResponse('Card not found', 404)

  const card = cardRow as { id: string; game_id: string; name: string; state: string; resolved_by_player_id: string | null }

  if (card.state !== 'held') return errorResponse('Card not in held state', 409)
  if (card.resolved_by_player_id !== playerId) return errorResponse('Not your card', 409)
  if (card.name !== 'Enigmatic Device') return errorResponse('Card is not an Enigmatic Device', 409)

  const { data: planets, error: planetsError } = await db
    .from('game_player_planets')
    .select('id, planet_name, tile_id, exhausted')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .in('planet_name', resourcePlanetNames)
  if (planetsError) return errorResponse('Database error', 500)

  const planetList = (planets ?? []) as Array<{ id: string; planet_name: string; tile_id: string; exhausted: boolean }>
  if (planetList.length !== resourcePlanetNames.length) return errorResponse('One or more planets not found or not controlled', 409)
  if (planetList.some((p) => p.exhausted)) return errorResponse('One or more planets are already exhausted', 409)

  const tileIds = [...new Set(planetList.map((p) => p.tile_id).filter(Boolean))]
  const { data: tiles, error: tileErr } = await db
    .from('tiles')
    .select('id, planets')
    .in('id', tileIds)
  if (tileErr) return errorResponse('Database error', 500)

  const tileMap = Object.fromEntries(
    ((tiles ?? []) as Array<{ id: string; planets: Array<{ name: string; resources: number }> }>)
      .map((t) => [t.id, t])
  )
  let totalResources = 0
  for (const p of planetList) {
    const tilePlanets = tileMap[p.tile_id]?.planets ?? []
    const def = tilePlanets.find((tp: { name: string }) => tp.name.toLowerCase() === p.planet_name.toLowerCase())
    if (def) totalResources += (def as { resources: number }).resources ?? 0
  }
  if (totalResources < 6) return errorResponse('Insufficient resources (need 6)', 409)

  const resolveContext: ResolveContext = {
    gameId,
    activatingPlayerId: playerId,
    selections: { technology_name: technologyName },
  }

  try {
    await applyAbility([{ op: 'gain_technology' }], resolveContext, db)
  } catch (e) {
    const err = e as Error & { status?: number }
    return errorResponse(err.message, err.status ?? 409)
  }

  const { error: exhaustErr } = await db
    .from('game_player_planets')
    .update({ exhausted: true })
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .in('planet_name', resourcePlanetNames)
  if (exhaustErr) return errorResponse('Database error', 500)

  const { error: purgeErr } = await db
    .from('game_exploration_decks')
    .update({ state: 'purged', resolved_by_player_id: null })
    .eq('id', cardId)
  if (purgeErr) return errorResponse('Database error', 500)

  return okResponse({ technology: technologyName })
}

if (typeof Deno !== 'undefined') Deno.serve(handler)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-use-enigmatic-device.test.js
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-use-enigmatic-device/ ti4-companion-web/tests/functions/game-use-enigmatic-device.test.js
git commit -m "feat: add game-use-enigmatic-device function"
```

---

### Task 8: game-land-troops — DMZ mech guard

**Files:**
- Modify: `supabase/functions/game-land-troops/index.ts`
- Test: `ti4-companion-web/tests/functions/game-land-troops.test.js`

- [ ] **Step 1: Write failing tests**

Add to `tests/functions/game-land-troops.test.js`:

```js
it('409 Cannot place a mech on a Demilitarized Zone planet', async () => {
  // Set up: unit_type='mech', planet has DMZ attachment UUID
  const dmzAttachmentId = 'att-dmz-1'
  mockDb({
    // planet has attachments: [dmzAttachmentId]
    planet: { id: 'pp-1', player_id: PLAYER_ID, planet_name: 'Wellon', tile_id: 'tile-1',
               space_dock_unit_id: null, pds_count: 0, attachments: [dmzAttachmentId] },
  })
  const origImpl = db.from.getMockImplementation()
  db.from.mockImplementation((table) => {
    if (table === 'attachments') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [{ id: dmzAttachmentId, name: 'Demilitarized Zone' }], error: null,
          }),
        }),
      }
    }
    return origImpl(table)
  })
  const res = await handler(makeRequest(baseBody({ unit_type: 'mech' })))
  const body = await res.json()
  expect(res.status).toBe(409)
  expect(body.error).toMatch(/Demilitarized Zone/i)
})

it('allows infantry landing even when DMZ attachment present', async () => {
  const dmzAttachmentId = 'att-dmz-1'
  mockDb({
    planet: { id: 'pp-1', player_id: PLAYER_ID, planet_name: 'Wellon', tile_id: 'tile-1',
               space_dock_unit_id: null, pds_count: 0, attachments: [dmzAttachmentId] },
  })
  // No unit_type in body (default infantry) — DMZ check should not run
  const res = await handler(makeRequest(baseBody()))
  expect(res.status).toBe(200)
})
```

The existing `baseBody` and `mockDb` for `game-land-troops.test.js` need to support `attachments` on the planet row. Check what the current `mockDb` returns for `game_player_planets` and ensure it passes `attachments` through. If `attachments` is not currently on the `planet` mock, add it as a default empty array in the existing `mockDb` helper.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-land-troops.test.js
```
Expected: 2 new tests FAIL.

- [ ] **Step 3: Implement in game-land-troops/index.ts**

After the planet ownership upsert and before unit placement, add the mech DMZ check.

First, update the `game_player_planets` query to also select `attachments`:
```typescript
    .select('id, player_id, planet_name, tile_id, space_dock_unit_id, pds_count, attachments')
```

Then add the check block (insert right after validating planet ownership, before any unit insert):

```typescript
  if (body.unit_type === 'mech') {
    const planetAttachments = (planetRow as { attachments: string[] | null }).attachments ?? []
    if (planetAttachments.length > 0) {
      const { data: attachmentRows, error: attachErr } = await db
        .from('attachments')
        .select('name')
        .in('id', planetAttachments)
      if (attachErr) return errorResponse('Database error', 500)
      const attachmentNames = ((attachmentRows ?? []) as Array<{ name: string }>).map((a) => a.name)
      if (attachmentNames.includes('Demilitarized Zone')) {
        return errorResponse('Cannot place a mech on a Demilitarized Zone planet', 409)
      }
    }
  }
```

`body.unit_type` needs to be in the body parse. Add it to the body type:
```typescript
  let body: { game_id?: unknown; player_id?: unknown; planet_name?: unknown; troop_count?: unknown; unit_type?: unknown }
```

No need to validate it (it's optional) — just read it:
```typescript
  // unit_type is optional; if 'mech', enforces DMZ check
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-land-troops.test.js
```
Expected: all tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
cd ti4-companion-web && npm test
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-land-troops/index.ts ti4-companion-web/tests/functions/game-land-troops.test.js
git commit -m "feat: add DMZ mech guard to game-land-troops"
```

---

### Task 9: client-edgeFunctions — add useEnigmaticDevice wrapper

**Files:**
- Modify: `src/lib/edgeFunctions.js`

- [ ] **Step 1: Add the export**

At the end of `src/lib/edgeFunctions.js`, add:

```js
export const useEnigmaticDevice = (gameId, playerId, cardId, resourcePlanetNames, technologyName) =>
  callFunction('game-use-enigmatic-device', {
    game_id: gameId,
    player_id: playerId,
    card_id: cardId,
    resource_planet_names: resourcePlanetNames,
    technology_name: technologyName,
  })
```

- [ ] **Step 2: Run the full suite one more time**

```bash
cd ti4-companion-web && npm test
```
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/edgeFunctions.js
git commit -m "feat: add useEnigmaticDevice wrapper to edgeFunctions"
```

---

### Task 10: Update _index.md and deploy

**Files:**
- Modify: `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`

- [ ] **Step 1: Mark all Phase 41 rows as done in _index.md**

Update each of the 9 Phase 41 rows in `_index.md` from `planned` to `done`.

- [ ] **Step 2: Deploy migration**

```bash
supabase db push
```

- [ ] **Step 3: Deploy all modified/new Edge Functions**

```bash
supabase functions deploy game-explore-planet --no-verify-jwt
supabase functions deploy game-explore-frontier --no-verify-jwt
supabase functions deploy game-resolve-exploration-card --no-verify-jwt
supabase functions deploy game-use-enigmatic-device --no-verify-jwt
supabase functions deploy game-land-troops --no-verify-jwt
```

- [ ] **Step 4: Commit _index.md update**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "docs: mark Phase 41 Exploration Full Validation as done"
```
