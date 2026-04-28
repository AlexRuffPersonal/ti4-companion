# Phase 19 — Ability DSL Completions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the 12 no-op stubs in `abilityDsl.ts` so every DSL op has a real server-side implementation, and add the one schema column (`vote_prevented`) needed to enforce vote prevention server-side.

**Architecture:** One migration adds `vote_prevented BOOLEAN` to `game_players`. All 12 ops are implemented in `abilityDsl.ts`; four of them (combat ops) use a new `CombatResolveContext` type that extends the base `ResolveContext`. `game-resolve-ability` is updated to construct this context when combat fields are present. `game-cast-votes` checks the flag; `game-advance-phase` clears it when leaving the agenda phase. `game-roll-combat-dice` gains `hit_on` in its `DieResult` type so `modify_roll` can recompute hits.

**Tech Stack:** Supabase Edge Functions (TypeScript/Deno), PostgreSQL, Vitest + vi.fn() mocks

---

## Files

| File | Action |
|------|--------|
| `supabase/migrations/035_ability_dsl_completions.sql` | Create |
| `supabase/functions/_shared/abilityDsl.ts` | Modify |
| `supabase/functions/game-roll-combat-dice/index.ts` | Modify |
| `supabase/functions/game-resolve-ability/index.ts` | Modify |
| `supabase/functions/game-cast-votes/index.ts` | Modify |
| `supabase/functions/game-advance-phase/index.ts` | Modify |
| `ti4-companion-web/tests/lib/abilityDsl.test.js` | Modify |
| `ti4-companion-web/tests/functions/game-cast-votes.test.js` | Modify |
| `ti4-companion-web/tests/functions/game-advance-phase.test.js` | Modify |
| `ti4-companion-web/tests/functions/game-resolve-ability.test.js` | Modify |
| `ti4-companion-web/tests/functions/game-roll-combat-dice.test.js` | Modify |

---

## Task 1: Migration — add `vote_prevented` to `game_players`

**Files:**
- Create: `supabase/migrations/035_ability_dsl_completions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/035_ability_dsl_completions.sql
ALTER TABLE game_players
  ADD COLUMN vote_prevented BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply and verify**

Run from the repo root:
```bash
supabase db push
```
Expected: no error. Then verify the column exists:
```bash
supabase db diff
```
Expected: diff is clean (migration applied).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/035_ability_dsl_completions.sql
git commit -m "feat(db): add vote_prevented column to game_players (migration 035)"
```

---

## Task 2: Add `hit_on` to `DieResult` in `game-roll-combat-dice`

This change is needed before `modify_roll` can recompute hits from stored dice.

**Files:**
- Modify: `supabase/functions/game-roll-combat-dice/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-roll-combat-dice.test.js`

- [ ] **Step 1: Find the existing roll-combat-dice test file**

```bash
cat ti4-companion-web/tests/functions/game-roll-combat-dice.test.js
```

Identify a test that asserts the shape of dice results (the `attacker_dice` / `defender_dice` array entries).

- [ ] **Step 2: Write a failing test asserting `hit_on` in each die entry**

In `ti4-companion-web/tests/functions/game-roll-combat-dice.test.js`, find the test that checks the structure of rolled dice (something like "attacker_roll stores dice results"). Add an assertion:

```js
// Inside the existing attacker_roll success test, after checking `dice`:
expect(data.dice[0]).toHaveProperty('hit_on')
expect(typeof data.dice[0].hit_on).toBe('number')
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-roll-combat-dice.test.js
```
Expected: FAIL — `hit_on` not in die entries.

- [ ] **Step 4: Update `DieResult` and `rollDice` in `game-roll-combat-dice/index.ts`**

Change the `DieResult` type and `rollDice` function:

```ts
// Change this:
type DieResult = { unit_type: string; roll: number; hit: boolean }

// To this:
type DieResult = { unit_type: string; roll: number; hit_on: number; hit: boolean }
```

In the `rollDice` function body, change the `results.push(...)` line:

```ts
// Change this:
results.push({ unit_type: unit.unit_type, roll, hit })

// To this:
results.push({ unit_type: unit.unit_type, roll, hit_on: value, hit })
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-roll-combat-dice.test.js
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/game-roll-combat-dice/index.ts ti4-companion-web/tests/functions/game-roll-combat-dice.test.js
git commit -m "feat(combat): add hit_on to DieResult for modify_roll support"
```

---

## Task 3: Add `CombatResolveContext` type and extend `ResolveContext`

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`

- [ ] **Step 1: Update the types in `abilityDsl.ts`**

In `supabase/functions/_shared/abilityDsl.ts`, update the `ResolveContext` interface and add `CombatResolveContext` directly below it:

```ts
// Change ResolveContext to add ignorePrerequisite:
export interface ResolveContext {
  gameId: string
  activatingPlayerId: string
  targetPlayerId?: string
  targetPlanetName?: string
  chosenAmount?: number
  chosenOption?: number
  ignorePrerequisite?: boolean  // set in-memory by ignore_prerequisite op; never from request
}

// Add after ResolveContext:
export interface CombatResolveContext extends ResolveContext {
  combatId: string
  systemKey: string
  side: 'attacker' | 'defender'
}
```

- [ ] **Step 2: Run existing DSL tests to confirm no regressions**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```
Expected: all existing tests PASS (type-only change, no logic change yet).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts
git commit -m "feat(dsl): add CombatResolveContext type and ignorePrerequisite to ResolveContext"
```

---

## Task 4: Implement Group 1 — resource mutation ops

Implement `draw_secret_objective`, `convert_commodities`, `gain_command_tokens`, `take_from_discard`.

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`
- Modify: `ti4-companion-web/tests/lib/abilityDsl.test.js`

- [ ] **Step 1: Write failing tests for Group 1 ops**

Add to `ti4-companion-web/tests/lib/abilityDsl.test.js`.

The existing `makeDb` helper must be extended. Replace the existing `makeDb` with this expanded version (keep all existing mock branches, add new ones):

```js
function makeDb({
  player = { id: 'p1', trade_goods: 3, commodities: 4, vp: 5, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 2, fleet: 3, strategy: 1 } },
  updateError = null,
  deckCard = null,
  secretObjCard = null,
  discardCard = null,
} = {}) {
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
                // for take_from_discard by id:
                maybeSingle: vi.fn().mockResolvedValue({ data: discardCard, error: null }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'game_player_secret_objectives') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: secretObjCard, error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      return { update: updateMock }
    }),
  }
  return { db, updateMock, updateChain }
}
```

Then add these test cases in a new `describe('Group 1 — resource mutations')` block:

```js
describe('Group 1 — resource mutations', () => {
  it('draw_secret_objective moves top deck card to held', async () => {
    const card = { id: 'so1' }
    const { db, updateMock } = makeDb({ secretObjCard: card })
    await interpretEffects([{ op: 'draw_secret_objective' }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ state: 'held', held_by_player_id: 'p1' })
  })

  it('draw_secret_objective throws when deck is empty', async () => {
    const { db } = makeDb({ secretObjCard: null })
    await expect(interpretEffects([{ op: 'draw_secret_objective' }], CTX, db))
      .rejects.toThrow('Secret objective deck is empty')
  })

  it('convert_commodities deducts commodities and adds trade goods', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 1, commodities: 4, vp: 0, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 2, fleet: 2, strategy: 2 } } })
    await interpretEffects([{ op: 'convert_commodities', amount: 2 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ commodities: 2, trade_goods: 3 })
  })

  it('convert_commodities throws when insufficient commodities', async () => {
    const { db } = makeDb({ player: { id: 'p1', trade_goods: 0, commodities: 1, vp: 0, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 2, fleet: 2, strategy: 2 } } })
    await expect(interpretEffects([{ op: 'convert_commodities', amount: 3 }], CTX, db))
      .rejects.toThrow('Insufficient commodities')
  })

  it('gain_command_tokens increments the correct bucket', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 2, fleet: 3, strategy: 1 } } })
    await interpretEffects([{ op: 'gain_command_tokens', bucket: 'fleet', amount: 2 }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ command_tokens: { tactic_total: 2, fleet: 5, strategy: 1 } })
  })

  it('gain_command_tokens defaults amount to 1', async () => {
    const { db, updateMock } = makeDb({ player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 2, fleet: 3, strategy: 1 } } })
    await interpretEffects([{ op: 'gain_command_tokens', bucket: 'strategy' }], CTX, db)
    expect(updateMock).toHaveBeenCalledWith({ command_tokens: { tactic_total: 2, fleet: 3, strategy: 2 } })
  })

  it('take_from_discard moves card from discard to hand', async () => {
    const card = { id: 'ac1', state: 'discard' }
    const { db, updateMock } = makeDb({ discardCard: card, player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 2, command_tokens: { tactic_total: 2, fleet: 2, strategy: 2 } } })
    await interpretEffects([{ op: 'take_from_discard', deck: 'action_card' }], { ...CTX, selections: { card_id: 'ac1' } }, db)
    expect(updateMock).toHaveBeenCalledWith({ state: 'held', held_by_player_id: 'p1', deck_position: null })
  })

  it('take_from_discard throws when card not found in discard', async () => {
    const { db } = makeDb({ discardCard: null })
    await expect(
      interpretEffects([{ op: 'take_from_discard', deck: 'action_card' }], { ...CTX, selections: { card_id: 'ac1' } }, db)
    ).rejects.toThrow('Card not found in discard')
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```
Expected: FAIL — ops still no-ops or unknown.

- [ ] **Step 3: Implement the four ops in `abilityDsl.ts`**

In `interpretOp`, replace the no-op cases for these ops. Add `selections` as a parameter by extending `interpretEffects` to pass `context` all the way through (it already does via `ctx`). Replace the matching `case` stubs:

```ts
case 'draw_secret_objective': {
  const { data: card, error: cardErr } = await db
    .from('game_player_secret_objectives')
    .select('id')
    .eq('game_id', context.gameId)
    .eq('state', 'deck')
    .order('deck_position', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (cardErr) throw new Error(`draw_secret_objective: query failed: ${cardErr.message}`)
  if (!card) throw new Error('Secret objective deck is empty')
  const { error } = await db
    .from('game_player_secret_objectives')
    .update({ state: 'held', held_by_player_id: context.activatingPlayerId })
    .eq('id', (card as Record<string, string>).id)
  if (error) throw new Error(`draw_secret_objective: update failed: ${error.message}`)
  break
}

case 'convert_commodities': {
  const amount = op.amount as number
  if ((player.commodities as number) < amount) throw new Error('Insufficient commodities')
  const { error } = await db
    .from('game_players')
    .update({ commodities: (player.commodities as number) - amount, trade_goods: (player.trade_goods as number) + amount })
    .eq('id', context.activatingPlayerId)
  if (error) throw new Error(`convert_commodities failed: ${error.message}`)
  break
}

case 'gain_command_tokens': {
  const bucket = op.bucket as string  // 'tactic_total' | 'fleet' | 'strategy'
  const amount = (op.amount as number) ?? 1
  const tokens = { ...(player.command_tokens as Record<string, number>) }
  tokens[bucket] = (tokens[bucket] ?? 0) + amount
  const { error } = await db
    .from('game_players')
    .update({ command_tokens: tokens })
    .eq('id', context.activatingPlayerId)
  if (error) throw new Error(`gain_command_tokens failed: ${error.message}`)
  break
}

case 'take_from_discard': {
  const cardId = ((context as ResolveContext & { selections?: Record<string, string> }).selections ?? {}).card_id
  const { data: discardCard, error: fetchErr } = await db
    .from('game_action_card_deck')
    .select('id, state')
    .eq('game_id', context.gameId)
    .eq('state', 'discard')
    .eq('id', cardId)
    .maybeSingle()
  if (fetchErr) throw new Error(`take_from_discard: query failed: ${fetchErr.message}`)
  if (!discardCard) throw new Error('Card not found in discard')
  const { error: updateErr } = await db
    .from('game_action_card_deck')
    .update({ state: 'held', held_by_player_id: context.activatingPlayerId, deck_position: null })
    .eq('id', cardId)
  if (updateErr) throw new Error(`take_from_discard: update failed: ${updateErr.message}`)
  const { error: countErr } = await db
    .from('game_players')
    .update({ action_card_count: ((player.action_card_count as number) ?? 0) + 1 })
    .eq('id', context.activatingPlayerId)
  if (countErr) throw new Error(`take_from_discard: count update failed: ${countErr.message}`)
  break
}
```

Also update the `interpretEffects` signature to thread a `selections` field through context. The existing `context` already carries `ResolveContext` — but `selections` needs to reach `interpretOp`. The cleanest approach: add `selections?: Record<string, unknown>` to `ResolveContext` and populate it in `game-resolve-ability` (Task 7). For now just cast as shown above.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts ti4-companion-web/tests/lib/abilityDsl.test.js
git commit -m "feat(dsl): implement draw_secret_objective, convert_commodities, gain_command_tokens, take_from_discard"
```

---

## Task 5: Implement Group 2 — technology ops

Implement `ignore_prerequisite` and `gain_technology`.

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`
- Modify: `ti4-companion-web/tests/lib/abilityDsl.test.js`

- [ ] **Step 1: Write failing tests**

Add a new `describe('Group 2 — technology')` block to `ti4-companion-web/tests/lib/abilityDsl.test.js`.

Extend `makeDb` to handle the `technologies` reference table:

```js
// Inside makeDb, add a new branch in the from() implementation:
if (table === 'technologies') {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockImplementation(() => {
          // Return a tech that requires 1 blue prerequisite
          if (/* techName */ true) {
            return Promise.resolve({ data: { name: 'Neural Motivator', prerequisites: ['blue'] }, error: null })
          }
        }),
      }),
    }),
  }
}
```

Actually, the mock for the technologies table needs to be configurable. Replace the static mock above with a `techRow` parameter:

```js
// Add to makeDb params:
techRow = { name: 'Neural Motivator', prerequisites: ['blue'] }

// Add to from() implementation:
if (table === 'technologies') {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: techRow, error: null }),
      }),
    }),
  }
}
```

Then add the test cases:

```js
describe('Group 2 — technology', () => {
  it('gain_technology appends tech when prerequisites are met', async () => {
    const { db, updateMock } = makeDb({
      player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: ['Sarween Tools'], action_card_count: 0, command_tokens: { tactic_total: 2, fleet: 2, strategy: 2 } },
      techRow: { name: 'Neural Motivator', prerequisites: [] },
    })
    await interpretEffects([{ op: 'gain_technology' }], { ...CTX, selections: { technology_name: 'Neural Motivator' } }, db)
    expect(updateMock).toHaveBeenCalledWith({ technologies: ['Sarween Tools', 'Neural Motivator'] })
  })

  it('gain_technology throws when already researched', async () => {
    const { db } = makeDb({
      player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: ['Neural Motivator'], action_card_count: 0, command_tokens: { tactic_total: 2, fleet: 2, strategy: 2 } },
      techRow: { name: 'Neural Motivator', prerequisites: [] },
    })
    await expect(interpretEffects([{ op: 'gain_technology' }], { ...CTX, selections: { technology_name: 'Neural Motivator' } }, db))
      .rejects.toThrow('Technology already researched')
  })

  it('gain_technology throws when prerequisites not met without ignore_prerequisite', async () => {
    const { db } = makeDb({
      player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 2, fleet: 2, strategy: 2 } },
      techRow: { name: 'Daxcive Animators', prerequisites: ['green'] },
    })
    await expect(interpretEffects([{ op: 'gain_technology' }], { ...CTX, selections: { technology_name: 'Daxcive Animators' } }, db))
      .rejects.toThrow('Prerequisites not met')
  })

  it('ignore_prerequisite + gain_technology skips prerequisite check', async () => {
    const { db, updateMock } = makeDb({
      player: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: { tactic_total: 2, fleet: 2, strategy: 2 } },
      techRow: { name: 'Daxcive Animators', prerequisites: ['green'] },
    })
    await interpretEffects(
      [{ op: 'ignore_prerequisite' }, { op: 'gain_technology' }],
      { ...CTX, selections: { technology_name: 'Daxcive Animators' } },
      db
    )
    expect(updateMock).toHaveBeenCalledWith({ technologies: ['Daxcive Animators'] })
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement `ignore_prerequisite` and `gain_technology` in `abilityDsl.ts`**

Also add `selections?: Record<string, unknown>` to `ResolveContext` to carry tech name cleanly:

```ts
// In ResolveContext, add:
selections?: Record<string, unknown>
```

Replace the no-op cases:

```ts
case 'ignore_prerequisite': {
  context.ignorePrerequisite = true
  break
}

case 'gain_technology': {
  const techName = ((context.selections ?? {}).technology_name as string)
  if (!techName) throw new Error('gain_technology: technology_name is required in selections')

  const { data: tech, error: techErr } = await db
    .from('technologies')
    .select('name, prerequisites')
    .eq('name', techName)
    .maybeSingle()
  if (techErr) throw new Error(`gain_technology: lookup failed: ${techErr.message}`)
  if (!tech) throw new Error(`gain_technology: technology '${techName}' not found`)

  const currentTechs = (player.technologies as string[]) ?? []
  if (currentTechs.includes(techName)) throw new Error('Technology already researched')

  if (!context.ignorePrerequisite) {
    const prereqs = (tech as Record<string, string[]>).prerequisites ?? []
    for (const prereq of prereqs) {
      const met = currentTechs.some((t: string) => t === prereq)
      if (!met) throw new Error(`Prerequisites not met: missing ${prereq}`)
    }
  }

  const { error } = await db
    .from('game_players')
    .update({ technologies: [...currentTechs, techName] })
    .eq('id', context.activatingPlayerId)
  if (error) throw new Error(`gain_technology: update failed: ${error.message}`)
  break
}
```

Note: `prerequisites` in the reference `technologies` table stores colour strings like `'blue'`, `'green'`, etc. `player.technologies` stores tech names. The prerequisite check verifies that for each required colour, the player has at least one tech of that colour. However the current schema stores tech names in `player.technologies` (text array), not colours. The prerequisite check above uses a simplified approach — for full correctness this would need a join back to the technologies table to check colours. For Phase 19, simplify: if `prerequisites` is an empty array, no check needed. If non-empty, the DB tech row's `prerequisites` field stores **tech names** (of required prerequisite techs), not colours. Check those names exist in `player.technologies`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts ti4-companion-web/tests/lib/abilityDsl.test.js
git commit -m "feat(dsl): implement ignore_prerequisite and gain_technology ops"
```

---

## Task 6: Implement Group 3 — agenda ops (`cast_votes`, `prevent_vote`)

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`
- Modify: `supabase/functions/game-cast-votes/index.ts`
- Modify: `supabase/functions/game-advance-phase/index.ts`
- Modify: `ti4-companion-web/tests/lib/abilityDsl.test.js`
- Modify: `ti4-companion-web/tests/functions/game-cast-votes.test.js`
- Modify: `ti4-companion-web/tests/functions/game-advance-phase.test.js`

- [ ] **Step 1: Write failing DSL tests for `cast_votes` and `prevent_vote`**

Extend `makeDb` with an `agenda_votes` upsert mock and `game_players` update support (already present). Add a new describe block:

```js
describe('Group 3 — agenda', () => {
  it('cast_votes upserts into game_agenda_votes', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    const { db } = makeDb()
    db.from.mockImplementation((table) => {
      if (table === 'game_agenda_votes') return { upsert: upsertMock }
      // fall through to base makeDb handling for game_players
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    })
    await interpretEffects(
      [{ op: 'cast_votes', amount: 3 }],
      { ...CTX, selections: { vote_outcome: 'for' } },
      db
    )
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ game_player_id: 'p1', vote_count: 3, choice: 'for' }),
      expect.anything()
    )
  })

  it('prevent_vote sets vote_prevented on target player', async () => {
    const { db, updateMock } = makeDb()
    await interpretEffects(
      [{ op: 'prevent_vote' }],
      { ...CTX, targetPlayerId: 'p2' },
      db
    )
    expect(updateMock).toHaveBeenCalledWith({ vote_prevented: true })
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement `cast_votes` and `prevent_vote` in `abilityDsl.ts`**

Replace the no-op cases:

```ts
case 'cast_votes': {
  const voteCount = (op.amount as number) ?? ((context.selections ?? {}).vote_count as number) ?? 0
  const outcome = ((context.selections ?? {}).vote_outcome as string) ?? null
  const { error } = await db
    .from('game_agenda_votes')
    .upsert(
      { game_id: context.gameId, game_player_id: context.activatingPlayerId, vote_count: voteCount, choice: outcome },
      { onConflict: 'game_id,game_player_id,agenda_id' }
    )
  if (error) throw new Error(`cast_votes failed: ${error.message}`)
  break
}

case 'prevent_vote': {
  const targetId = op.target === 'self' ? context.activatingPlayerId : (context.targetPlayerId ?? context.activatingPlayerId)
  const { error } = await db
    .from('game_players')
    .update({ vote_prevented: true })
    .eq('id', targetId)
  if (error) throw new Error(`prevent_vote failed: ${error.message}`)
  break
}
```

- [ ] **Step 4: Write failing test for `game-cast-votes` vote prevention**

In `ti4-companion-web/tests/functions/game-cast-votes.test.js`, find where `mockDb` sets up `callerPlayer` and add a case for `vote_prevented`. Add a test:

```js
it('returns 409 when caller vote is prevented', async () => {
  requireAuth.mockResolvedValue(VOTER_USER_ID)
  mockDb({
    callerPlayer: { id: VOTER_PLAYER_ID, vote_prevented: true },
  })
  const res = await handler(makeRequest({ game_id: GAME_ID, vote_count: 3, choice: 'for' }))
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.error).toMatch(/vote.*prevented/i)
})
```

- [ ] **Step 5: Run to verify the new cast-votes test fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-cast-votes.test.js
```
Expected: FAIL (new test).

- [ ] **Step 6: Add `vote_prevented` check to `game-cast-votes/index.ts`**

In `supabase/functions/game-cast-votes/index.ts`, update the `game_players` select to include `vote_prevented`:

```ts
// Change:
.select('id')

// To:
.select('id, vote_prevented')
```

Then add the check immediately after loading `callerPlayer`:

```ts
if (!callerPlayer || callerPlayer.id !== game.agenda_vote_current_player_id) {
  return errorResponse('It is not your turn to vote', 403)
}

// Add this block:
if ((callerPlayer as Record<string, unknown>).vote_prevented) {
  return errorResponse('Your vote has been prevented', 409)
}
```

- [ ] **Step 7: Write failing test for `game-advance-phase` clearing `vote_prevented`**

In `ti4-companion-web/tests/functions/game-advance-phase.test.js`, find the test for the `status → agenda` transition (the case where `agenda_unlocked: true`). Add a test:

```js
it('clears vote_prevented for all players when advancing to agenda phase', async () => {
  requireAuth.mockResolvedValue(HOST_ID)
  const { updateMock } = mockDb({ game: { id: GAME_ID, host_user_id: HOST_ID, phase: 'status', round: 2, agenda_unlocked: true } })
  await handler(makeRequest({ game_id: GAME_ID }))
  // Verify game_players.update was called with vote_prevented: false
  const calls = updateMock.mock.calls
  const clearsVotePrevented = calls.some(args => args[0] && args[0].vote_prevented === false)
  expect(clearsVotePrevented).toBe(true)
})
```

- [ ] **Step 8: Run to verify the new advance-phase test fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-advance-phase.test.js
```
Expected: FAIL (new test).

- [ ] **Step 9: Add vote_prevented reset to `game-advance-phase/index.ts`**

In the `status` phase branch, after advancing to `agenda` phase, add a reset. Find the block after the `games.update` call in the `status` branch and add:

```ts
// After the games update in the status → agenda path:
if (nextPhase === 'agenda') {
  const { error: voteResetError } = await db
    .from('game_players')
    .update({ vote_prevented: false })
    .eq('game_id', body.game_id)
  if (voteResetError) return errorResponse(`Failed to reset vote prevention: ${voteResetError.message}`, 500)
}
```

- [ ] **Step 10: Run all affected tests**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js tests/functions/game-cast-votes.test.js tests/functions/game-advance-phase.test.js
```
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts supabase/functions/game-cast-votes/index.ts supabase/functions/game-advance-phase/index.ts ti4-companion-web/tests/lib/abilityDsl.test.js ti4-companion-web/tests/functions/game-cast-votes.test.js ti4-companion-web/tests/functions/game-advance-phase.test.js
git commit -m "feat(dsl): implement cast_votes and prevent_vote; enforce vote_prevented in game-cast-votes and game-advance-phase"
```

---

## Task 7: Update `game-resolve-ability` to build `CombatResolveContext`

**Files:**
- Modify: `supabase/functions/game-resolve-ability/index.ts`
- Modify: `ti4-companion-web/tests/functions/game-resolve-ability.test.js`

- [ ] **Step 1: Write a failing test for combat context threading**

In `ti4-companion-web/tests/functions/game-resolve-ability.test.js`, add a test that sends `combat_id`, `system_key`, and `side` in the request and verifies that `interpretEffects` is called with a context containing those fields:

```js
it('builds CombatResolveContext when combat fields are present', async () => {
  requireAuth.mockResolvedValue(USER_ID)
  mockDb()
  const res = await handler(makeRequest({
    game_id: GAME_ID,
    ability_definition_id: ABILITY_ID,
    source_type: 'faction_ability',
    combat_id: 'combat-uuid',
    system_key: '1,2',
    side: 'attacker',
    selections: {},
  }))
  expect(res.status).toBe(200)
  expect(interpretEffects).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ combatId: 'combat-uuid', systemKey: '1,2', side: 'attacker' }),
    expect.anything()
  )
})
```

- [ ] **Step 2: Run to verify the test fails**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.test.js
```
Expected: FAIL — context doesn't have combat fields.

- [ ] **Step 3: Update `game-resolve-ability/index.ts`**

Update the body type and context construction:

```ts
// Change body type:
let body: {
  game_id?: unknown
  ability_definition_id?: unknown
  source_type?: unknown
  source_id?: unknown
  selections?: unknown
  combat_id?: unknown
  system_key?: unknown
  side?: unknown
}

// Change context construction (step 4 in the handler):
const selections = ((body.selections ?? {}) as Record<string, unknown>)

const hasCombatContext = body.combat_id && body.system_key && body.side
const context = hasCombatContext
  ? {
      gameId: body.game_id as string,
      activatingPlayerId: (player as Record<string, string>).id,
      targetPlayerId: selections.chosen_player as string | undefined,
      targetPlanetName: selections.chosen_planet as string | undefined,
      chosenAmount: selections.chosen_amount as number | undefined,
      chosenOption: selections.chosen_option as number | undefined,
      selections,
      combatId: body.combat_id as string,
      systemKey: body.system_key as string,
      side: body.side as 'attacker' | 'defender',
    }
  : {
      gameId: body.game_id as string,
      activatingPlayerId: (player as Record<string, string>).id,
      targetPlayerId: selections.chosen_player as string | undefined,
      targetPlanetName: selections.chosen_planet as string | undefined,
      chosenAmount: selections.chosen_amount as number | undefined,
      chosenOption: selections.chosen_option as number | undefined,
      selections,
    }
```

Also update the import line to include `CombatResolveContext`:

```ts
import { interpretEffects, ResolveContext, CombatResolveContext } from '../_shared/abilityDsl.ts'
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.test.js
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-resolve-ability/index.ts ti4-companion-web/tests/functions/game-resolve-ability.test.js
git commit -m "feat(dsl): thread CombatResolveContext through game-resolve-ability"
```

---

## Task 8: Implement Group 4a — combat hit ops (`cancel_hit`, `add_die`, `modify_roll`)

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`
- Modify: `ti4-companion-web/tests/lib/abilityDsl.test.js`

- [ ] **Step 1: Write failing tests**

Extend `makeDb` with a `game_combats` mock branch. Add `combatRow` parameter:

```js
// Add to makeDb params:
combatRow = null

// Add to from() in makeDb:
if (table === 'game_combats') {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: combatRow, error: null }),
      }),
    }),
    update: updateMock,
  }
}
```

Then add the describe block:

```js
describe('Group 4a — combat hit ops', () => {
  const COMBAT_CTX = {
    ...CTX,
    combatId: 'c1',
    systemKey: '1,2',
    side: 'attacker',
  }

  it('cancel_hit decrements defender_hits when op.target is opponent', async () => {
    const { db, updateMock } = makeDb({
      combatRow: { id: 'c1', attacker_hits: 2, defender_hits: 3, attacker_dice: [], defender_dice: [] },
    })
    await interpretEffects([{ op: 'cancel_hit', target: 'opponent' }], COMBAT_CTX, db)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ defender_hits: 2 }))
  })

  it('cancel_hit floors at 0', async () => {
    const { db, updateMock } = makeDb({
      combatRow: { id: 'c1', attacker_hits: 0, defender_hits: 0, attacker_dice: [], defender_dice: [] },
    })
    await interpretEffects([{ op: 'cancel_hit', target: 'opponent' }], COMBAT_CTX, db)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ defender_hits: 0 }))
  })

  it('add_die appends die to attacker_dice and increments hits on success', async () => {
    // Mock Math.random to return deterministic value: 0.9 → roll = 9 >= hit_on 7 → hit
    vi.spyOn(Math, 'random').mockReturnValue(0.89)  // ceil(0.89 * 10) = 9
    const { db, updateMock } = makeDb({
      combatRow: { id: 'c1', attacker_hits: 1, defender_hits: 0, attacker_dice: [{ unit_type: 'cruiser', roll: 8, hit_on: 7, hit: true }], defender_dice: [] },
    })
    await interpretEffects([{ op: 'add_die', hit_on: 7 }], COMBAT_CTX, db)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      attacker_hits: 2,
      attacker_dice: expect.arrayContaining([
        expect.objectContaining({ unit_type: '__ability__', roll: 9, hit_on: 7, hit: true }),
      ]),
    }))
    vi.restoreAllMocks()
  })

  it('add_die does not increment hits on miss', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)  // ceil(0.5 * 10) = 5 < hit_on 7 → miss
    const { db, updateMock } = makeDb({
      combatRow: { id: 'c1', attacker_hits: 1, defender_hits: 0, attacker_dice: [], defender_dice: [] },
    })
    await interpretEffects([{ op: 'add_die', hit_on: 7 }], COMBAT_CTX, db)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ attacker_hits: 1 }))
    vi.restoreAllMocks()
  })

  it('modify_roll adds modifier to dice values and recounts hits', async () => {
    // 2 dice: roll=6 hit_on=7 (miss), roll=8 hit_on=7 (hit). +1 modifier → roll=7 (now hit), roll=9 (hit)
    const { db, updateMock } = makeDb({
      combatRow: {
        id: 'c1', attacker_hits: 1, defender_hits: 0,
        attacker_dice: [
          { unit_type: 'cruiser', roll: 6, hit_on: 7, hit: false },
          { unit_type: 'cruiser', roll: 8, hit_on: 7, hit: true },
        ],
        defender_dice: [],
      },
    })
    await interpretEffects([{ op: 'modify_roll', modifier: 1 }], COMBAT_CTX, db)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      attacker_hits: 2,
      attacker_dice: [
        { unit_type: 'cruiser', roll: 7, hit_on: 7, hit: true },
        { unit_type: 'cruiser', roll: 9, hit_on: 7, hit: true },
      ],
    }))
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement `cancel_hit`, `add_die`, `modify_roll` in `abilityDsl.ts`**

These ops need `CombatResolveContext`. Add a helper at the top of `interpretOp` to load the combat row when needed. Replace the three no-op cases:

```ts
case 'cancel_hit': {
  const ctx = context as CombatResolveContext
  const { data: combat, error: combatErr } = await db
    .from('game_combats')
    .select('attacker_hits, defender_hits')
    .eq('id', ctx.combatId)
    .maybeSingle()
  if (combatErr || !combat) throw new Error('cancel_hit: combat not found')
  const c = combat as Record<string, number>
  const targetSide = (op.target as string) === 'self' ? ctx.side : (ctx.side === 'attacker' ? 'defender' : 'attacker')
  const hitsCol = targetSide === 'attacker' ? 'attacker_hits' : 'defender_hits'
  const newHits = Math.max(0, c[hitsCol] - 1)
  const { error } = await db.from('game_combats').update({ [hitsCol]: newHits }).eq('id', ctx.combatId)
  if (error) throw new Error(`cancel_hit: update failed: ${error.message}`)
  break
}

case 'add_die': {
  const ctx = context as CombatResolveContext
  const hitOn = op.hit_on as number
  const roll = Math.ceil(Math.random() * 10)
  const hit = roll >= hitOn
  const { data: combat, error: combatErr } = await db
    .from('game_combats')
    .select('attacker_hits, defender_hits, attacker_dice, defender_dice')
    .eq('id', ctx.combatId)
    .maybeSingle()
  if (combatErr || !combat) throw new Error('add_die: combat not found')
  const c = combat as Record<string, unknown>
  const diceCol = ctx.side === 'attacker' ? 'attacker_dice' : 'defender_dice'
  const hitsCol = ctx.side === 'attacker' ? 'attacker_hits' : 'defender_hits'
  const newDice = [...(c[diceCol] as unknown[]), { unit_type: '__ability__', roll, hit_on: hitOn, hit }]
  const newHits = (c[hitsCol] as number) + (hit ? 1 : 0)
  const { error } = await db.from('game_combats').update({ [diceCol]: newDice, [hitsCol]: newHits }).eq('id', ctx.combatId)
  if (error) throw new Error(`add_die: update failed: ${error.message}`)
  break
}

case 'modify_roll': {
  const ctx = context as CombatResolveContext
  const modifier = op.modifier as number
  const { data: combat, error: combatErr } = await db
    .from('game_combats')
    .select('attacker_hits, defender_hits, attacker_dice, defender_dice')
    .eq('id', ctx.combatId)
    .maybeSingle()
  if (combatErr || !combat) throw new Error('modify_roll: combat not found')
  const c = combat as Record<string, unknown>
  const diceCol = ctx.side === 'attacker' ? 'attacker_dice' : 'defender_dice'
  const hitsCol = ctx.side === 'attacker' ? 'attacker_hits' : 'defender_hits'
  type DieEntry = { unit_type: string; roll: number; hit_on: number; hit: boolean }
  const updatedDice = (c[diceCol] as DieEntry[]).map(d => {
    const newRoll = d.roll + modifier
    return { ...d, roll: newRoll, hit: newRoll >= d.hit_on }
  })
  const newHits = updatedDice.filter(d => d.hit).length
  const { error } = await db.from('game_combats').update({ [diceCol]: updatedDice, [hitsCol]: newHits }).eq('id', ctx.combatId)
  if (error) throw new Error(`modify_roll: update failed: ${error.message}`)
  break
}
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts ti4-companion-web/tests/lib/abilityDsl.test.js
git commit -m "feat(dsl): implement cancel_hit, add_die, modify_roll combat ops"
```

---

## Task 9: Implement Group 4b — unit placement ops (`place_units`, `destroy_units`)

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`
- Modify: `ti4-companion-web/tests/lib/abilityDsl.test.js`

- [ ] **Step 1: Write failing tests**

Extend `makeDb` with a `game_player_units` mock branch. Add `unitRow` param (for destroy — the existing unit) and `upsertUnitMock`:

```js
// Add to makeDb params:
unitRow = null   // for destroy_units fetch

// Add to from() in makeDb:
if (table === 'game_player_units') {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: unitRow, error: null }),
            }),
          }),
        }),
      }),
    }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: updateMock,
    delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  }
}
```

Then add tests:

```js
describe('Group 4b — unit placement', () => {
  const COMBAT_CTX = {
    ...CTX,
    combatId: 'c1',
    systemKey: '1,2',
    side: 'attacker',
    selections: { unit_type: 'infantry', count: 2 },
  }

  it('place_units upserts into game_player_units', async () => {
    const { db } = makeDb()
    const upsertSpy = vi.fn().mockResolvedValue({ error: null })
    db.from.mockImplementation((table) => {
      if (table === 'game_player_units') return { upsert: upsertSpy }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }) }
    })
    await interpretEffects(
      [{ op: 'place_units', unit_type: 'infantry', count: 2 }],
      { ...COMBAT_CTX, selections: { planet_name: 'Mecatol Rex' } },
      db
    )
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ unit_type: 'infantry', count: 2, on_planet: 'Mecatol Rex' }),
      expect.anything()
    )
  })

  it('destroy_units decrements count and deletes row at 0', async () => {
    const { db, updateMock } = makeDb({ unitRow: { id: 'u1', count: 1 } })
    let deleteCalled = false
    db.from.mockImplementation((table) => {
      if (table === 'game_player_units') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'u1', count: 1 }, error: null }) }) }) }) }) }),
          update: updateMock,
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockImplementation(() => { deleteCalled = true; return Promise.resolve({ error: null }) }) }),
        }
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', trade_goods: 0, commodities: 0, vp: 0, technologies: [], action_card_count: 0, command_tokens: {} }, error: null }) }) }) }
    })
    await interpretEffects(
      [{ op: 'destroy_units' }],
      { ...COMBAT_CTX, selections: { unit_type: 'infantry', count: 1 } },
      db
    )
    expect(deleteCalled).toBe(true)
  })

  it('destroy_units throws when unit not found', async () => {
    const { db } = makeDb({ unitRow: null })
    await expect(interpretEffects([{ op: 'destroy_units' }], COMBAT_CTX, db))
      .rejects.toThrow('No units to destroy')
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement `place_units` and `destroy_units` in `abilityDsl.ts`**

Replace the no-op cases:

```ts
case 'place_units': {
  const ctx = context as CombatResolveContext
  const unitType = op.unit_type as string
  const count = (op.count as number) ?? 1
  const onPlanet = (context.selections?.planet_name as string) ?? null
  const systemKey = (context.selections?.system_key as string) ?? ctx.systemKey
  const { error } = await db
    .from('game_player_units')
    .upsert(
      { game_id: context.gameId, player_id: context.activatingPlayerId, system_key: systemKey, unit_type: unitType, on_planet: onPlanet, count },
      { onConflict: 'game_id,player_id,system_key,unit_type,on_planet', ignoreDuplicates: false }
    )
  if (error) throw new Error(`place_units: upsert failed: ${error.message}`)
  break
}

case 'destroy_units': {
  const ctx = context as CombatResolveContext
  const unitType = (context.selections?.unit_type as string)
  const count = (context.selections?.count as number) ?? 1
  const onPlanet = (context.selections?.planet_name as string) ?? null
  const systemKey = (context.selections?.system_key as string) ?? ctx.systemKey
  const { data: unitRow, error: fetchErr } = await db
    .from('game_player_units')
    .select('id, count')
    .eq('game_id', context.gameId)
    .eq('player_id', context.activatingPlayerId)
    .eq('system_key', systemKey)
    .eq('unit_type', unitType)
    .eq('on_planet', onPlanet)
    .maybeSingle()
  if (fetchErr) throw new Error(`destroy_units: query failed: ${fetchErr.message}`)
  const u = unitRow as Record<string, unknown> | null
  if (!u || (u.count as number) < count) throw new Error('No units to destroy')
  const newCount = (u.count as number) - count
  if (newCount === 0) {
    const { error } = await db.from('game_player_units').delete().eq('id', u.id)
    if (error) throw new Error(`destroy_units: delete failed: ${error.message}`)
  } else {
    const { error } = await db.from('game_player_units').update({ count: newCount }).eq('id', u.id)
    if (error) throw new Error(`destroy_units: update failed: ${error.message}`)
  }
  break
}
```

- [ ] **Step 4: Run all DSL tests**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts ti4-companion-web/tests/lib/abilityDsl.test.js
git commit -m "feat(dsl): implement place_units and destroy_units ops"
```

---

## Task 10: Full test run, deploy, and mark done

**Files:**
- Modify: `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`

Note: main_plan spec files and the initial `_index.md` rows were added before this plan was committed (as required). This task only marks them done after deploy.

- [ ] **Step 1: Run the full test suite**

```bash
cd ti4-companion-web && npm test
```
Expected: all existing tests pass plus all new tests added in this phase.

- [ ] **Step 2: Deploy all modified Edge Functions**

```bash
supabase functions deploy game-resolve-ability --no-verify-jwt
supabase functions deploy game-cast-votes --no-verify-jwt
supabase functions deploy game-advance-phase --no-verify-jwt
supabase functions deploy game-roll-combat-dice --no-verify-jwt
```

- [ ] **Step 3: Mark Phase 19 rows as `done` in `_index.md`**

In `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`, change all six Phase 19 rows from `planned` to `done`.

- [ ] **Step 4: Commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "docs: mark Phase 19 spec files as done in main_plan index"
```
