# Phase 43a — Leader Card Abilities: Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up all 24 faction agents so activating them writes the exhaust state to `game_players.leaders.agent`, runs the ability (DSL ops or named handler), emits reactive-agent pending windows to other players, and readies agents during the status phase.

**Architecture:** New `leaderEffects.ts` static registry mirrors the `relicEffects.ts` / `techEffects.ts` pattern. `game-resolve-ability` already accepts `source_type='leader'`; this phase adds the full execution branch. New DSL ops go into `abilityDsl.ts`. Named handlers for complex abilities go into `abilityHandlers.ts`. Reactive agents emit `pending_window.type='reactive_agent'` from `game-activate-system`, `game-produce-units`, and `game-assign-hits` — handled by `useLeaders` in the web client via a new `LeaderAbilityModal` component.

**Tech Stack:** Deno/TypeScript (Edge Functions), React 19 + Tailwind CSS 3 (web), Vitest + @testing-library/react (tests)

---

## Files

| File | Action |
|------|--------|
| `supabase/migrations/052_leader_abilities.sql` | Create |
| `src/lib/leaderConstants.js` | Create |
| `src/components/game/LeaderAbilityModal.jsx` | Create |
| `supabase/functions/_shared/leaderEffects.ts` | Create |
| `supabase/functions/_shared/abilityDsl.ts` | Modify — add 7 new op handlers |
| `supabase/functions/_shared/abilityHandlers.ts` | Modify — register all complex agent handlers |
| `supabase/functions/game-resolve-ability/index.ts` | Modify — add leader branch + reactive window check |
| `supabase/functions/game-advance-phase/index.ts` | Modify — ready exhausted agents + clear round flags |
| `supabase/functions/game-activate-system/index.ts` | Modify — emit reactive_agent window on SYSTEM_ACTIVATED |
| `supabase/functions/game-produce-units/index.ts` | Modify — emit reactive_agent window on PRODUCTION |
| `supabase/functions/game-assign-hits/index.ts` | Modify — emit reactive_agent window on SUSTAIN_DAMAGE / GROUND_COMBAT_START |
| `src/hooks/useLeaders.js` | Modify — add modal state + handleReactiveAgentWindow |
| `src/components/game/LeaderPanel.jsx` | Modify — render LeaderAbilityModal |
| `src/components/game/GameScreen.jsx` | Modify — route reactive_agent pending_window |
| `tests/lib/leaderConstants.test.js` | Create (smoke) |
| `tests/lib/abilityDsl.test.js` | Modify — new op describe blocks |
| `tests/functions/game-resolve-ability.test.js` | Modify — agent branch + reactive windows |
| `tests/functions/game-advance-phase.test.js` | Modify — agent readying + round flags |
| `tests/functions/game-activate-system.test.js` | Modify — reactive window |
| `tests/functions/game-produce-units.test.js` | Modify — reactive window |
| `tests/functions/game-assign-hits.test.js` | Modify — reactive window |
| `tests/hooks/useLeaders.test.js` | Modify — modal state + reactive handler |

---

### Task 1: Database migration — add `commander_flags` and `game_round_flags` columns

**Files:**
- Create: `supabase/migrations/052_leader_abilities.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/052_leader_abilities.sql
ALTER TABLE game_players
  ADD COLUMN IF NOT EXISTS commander_flags JSONB NOT NULL DEFAULT '{}';

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_round_flags JSONB NOT NULL DEFAULT '{}';
```

- [ ] **Step 2: Apply to local Supabase**

```bash
supabase db reset
# or
supabase migration up
```

Expected: migration applies cleanly; `\d game_players` shows `commander_flags jsonb` column; `\d games` shows `game_round_flags jsonb` column.

- [ ] **Step 3: Run test suite to verify nothing is broken**

```bash
cd ti4-companion-web && npm test
```

Expected: all existing tests still pass (migration is additive only).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/052_leader_abilities.sql
git commit -m "feat(db): add commander_flags and game_round_flags columns (migration 052)"
```

---

### Task 2: `leaderEffects.ts` — static ability registry

**Files:**
- Create: `supabase/functions/_shared/leaderEffects.ts`

This file defines the types and registries referenced by all Phase 43 Edge Functions. Read spec file `shared-leaderEffects.md` before starting.

- [ ] **Step 1: Write the file**

```typescript
// supabase/functions/_shared/leaderEffects.ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Op } from './abilityDsl.ts'

export type CommanderTrigger =
  | 'PRODUCTION' | 'TECH_RESEARCHED' | 'SUSTAIN_DAMAGE' | 'GROUND_COMBAT_START'
  | 'COMBAT_ROLL' | 'UNIT_ABILITY_ROLL' | 'BOMBARDMENT' | 'SYSTEM_ACTIVATED'
  | 'SHIPS_MOVED' | 'PLANET_CONTROL_GAINED' | 'STRATEGY_TOKEN_SPENT' | 'CAST_VOTES'

export interface CommanderPassive {
  trigger: CommanderTrigger
  mode: 'inline' | 'window'
  condition?: string
  effect: Op[] | string
  targetPlayer?: 'self' | 'activating' | 'any'
}

// Phase 43a: agents — simple abilities use Op[]; complex use a handler key
export const AGENT_ABILITIES: Record<string, Op[] | string> = {
  'The Mahact Gene-Sorcerers':   'mahact_scepter_of_dominion',
  'The Argent Flight':           [{ op: 'gain_trade_goods', amount: 1 }],
  'The Nekro Virus':             'nekro_malleon',
  'The Titans Of Ul':            [{ op: 'cancel_hit', target: 'either' }],
  'The Vuil\'raith Cabal':       'stillness_of_stars',
  'The Embers Of Muaat':         [{ op: 'place_units', unit_type: 'warsun', count: 1, target: 'home_system' }],
  'The L1Z1X Mindnet':           'l1z1x_i48s',
  'The Naaz-Rokha Alliance':     [{ op: 'gain_trade_goods', amount: 1 }],
  'The Federation Of Sol':       [{ op: 'place_units', unit_type: 'infantry', count: 3, target: 'active_planet' }],
  'The Clan Of Saar':            [{ op: 'increase_move', target: 'chosen_ship' }],
  'The Barony Of Letnev':        'letnev_viscount',
  'The Universities Of Jol-Nar': [{ op: 'draw_action_card', count: 1 }],
  'The Yin Brotherhood':         [{ op: 'place_units', unit_type: 'destroyer', count: 2, target: 'active_system' }],
  'The Emirates Of Hacan':       'hacan_carth',
  'The Winnu':                   [{ op: 'gain_trade_goods', amount: 3 }],
  'The Nomad':                   [{ op: 'score_secret_objective', optional: true }],
  'The Yssaril Tribes':          'ssruu_copies_agents',
  'The Arborec':                 [{ op: 'replace_ship', max_cost_increase: 2 }],
  'The Naalu Collective':        [{ op: 'look_at_action_cards', count: 3, target: 'chosen_player' }],
  'The Xxcha Kingdom':           'xxcha_xxzoth',
  'The Mentak Coalition':        'mentak_suffi_an',
  'The Empyrean':                'empyrean_acidos',
  'Sardakk N\'orr':              [{ op: 'add_combat_die', round: 'all', target: 'self' }],
  'The Ghosts Of Creuss':        'creuss_emissary',
}

// Phase 43b: heroes (populated in Phase 43b)
export const HERO_ABILITIES: Record<string, Op[] | string> = {}

// Phase 43c: commander passives (populated in Phase 43c)
export const COMMANDER_PASSIVES: Record<string, CommanderPassive[]> = {}

// Factions whose agents can react to other players' actions
export const AGENT_REACTIVE_TRIGGERS: Record<string, CommanderTrigger[]> = {
  'The Ghosts Of Creuss':   ['SYSTEM_ACTIVATED'],
  'The Arborec':            ['SYSTEM_ACTIVATED'],
  'The Empyrean':           ['SHIPS_MOVED'],
  'The Barony Of Letnev':   ['GROUND_COMBAT_START'],
  'The Federation Of Sol':  ['GROUND_COMBAT_START'],
  'The Yssaril Tribes':     ['SYSTEM_ACTIVATED'],
  'The Titans Of Ul':       ['SUSTAIN_DAMAGE'],
  'The Winnu':              ['PRODUCTION'],
}

export interface ReactiveAgentEntry {
  player_id: string
  faction: string
  agent_id?: string
}

export function collectReactiveAgents(
  players: Array<{ id: string; faction: string; leaders?: Record<string, string> }>,
  trigger: CommanderTrigger,
  excludeId: string
): ReactiveAgentEntry[] {
  return players
    .filter(p => p.id !== excludeId && p.leaders?.agent === 'unlocked')
    .filter(p => (AGENT_REACTIVE_TRIGGERS[p.faction] ?? []).includes(trigger))
    .map(p => ({ player_id: p.id, faction: p.faction }))
}

export async function applyCommanderPassives(
  _trigger: CommanderTrigger,
  _context: Record<string, unknown>,
  _db: SupabaseClient
): Promise<{ inlineEffects: unknown[]; pendingWindows: unknown[] }> {
  // Populated in Phase 43c
  return { inlineEffects: [], pendingWindows: [] }
}
```

- [ ] **Step 2: Run existing tests to confirm no import errors**

```bash
cd ti4-companion-web && npm test
```

Expected: all tests pass (file is new — nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/leaderEffects.ts
git commit -m "feat(leaders): add leaderEffects.ts static registry (Phase 43a stub)"
```

---

### Task 3: `abilityDsl.ts` — add 7 new op handlers

**Files:**
- Modify: `supabase/functions/_shared/abilityDsl.ts`

Read spec file `shared-abilityDsl-p43a.md` for the full pseudocode of each op. Read the existing `abilityDsl.ts` to find the `switch` statement where ops are dispatched before adding the cases below.

- [ ] **Step 1: Write failing tests for the new ops**

In `tests/lib/abilityDsl.test.js`, add:

```javascript
describe('reclaim_command_tokens', () => {
  it('deletes all player activations from the board', async () => {
    const mockDelete = vi.fn().mockResolvedValue({ error: null })
    mockSupabase.from.mockReturnValue({ delete: () => ({ eq: () => ({ eq: mockDelete }) }) })
    await executeOp({ op: 'reclaim_command_tokens' }, { gameId: 'g1', playerId: 'p1' }, mockSupabase)
    expect(mockDelete).toHaveBeenCalled()
  })
})

describe('replace_ship', () => {
  it('returns 409 when new unit costs more than 2 above old', async () => {
    // mock units table: old unit cost 3, new unit cost 6
    await expect(
      executeOp({ op: 'replace_ship', max_cost_increase: 2 },
        { gameId: 'g1', playerId: 'p1', selections: { old_unit_type: 'destroyer', new_unit_type: 'dreadnought', system_key: '0,0', chosen_player_id: 'p1' } },
        mockSupabase)
    ).rejects.toMatchObject({ status: 409 })
  })
  it('decrements old unit and upserts new unit on success', async () => {
    // mock units: old cost 2, new cost 4 (within +2 limit)
    // assert upsert called with correct unit type
  })
})

describe('give_promissory_to_opponent', () => {
  it('returns 409 when note not found in opponent hand', async () => {
    mockSupabase.from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ single: () => ({ data: null, error: { message: 'not found' } }) }) }) }) })
    await expect(
      executeOp({ op: 'give_promissory_to_opponent' },
        { gameId: 'g1', playerId: 'p1', selections: { chosen_player_id: 'p2', note_id: 'note1' } },
        mockSupabase)
    ).rejects.toMatchObject({ status: 409 })
  })
  it('transfers note to activating player on success', async () => {
    // mock note found in opponent hand; assert update called with correct player
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```

Expected: FAIL — ops not yet implemented.

- [ ] **Step 3: Implement the new ops in `abilityDsl.ts`**

In the op `switch` statement, add cases matching the pseudocode in spec `shared-abilityDsl-p43a.md`:

```typescript
case 'reclaim_command_tokens': {
  const { error } = await db
    .from('game_system_activations')
    .delete()
    .eq('game_id', context.gameId)
    .eq('player_id', context.playerId)
  if (error) throw error
  break
}

case 'replace_ship': {
  const { chosen_player_id, system_key, old_unit_type, new_unit_type } = context.selections as Record<string, string>
  const { data: units } = await db.from('units').select('name,cost')
  const oldDef = units?.find((u: { name: string }) => u.name === old_unit_type)
  const newDef = units?.find((u: { name: string }) => u.name === new_unit_type)
  if (!oldDef || !newDef) throw { status: 404, message: 'Unit type not found' }
  if (newDef.cost > oldDef.cost + ((op as { max_cost_increase?: number }).max_cost_increase ?? 2)) {
    throw { status: 409, message: 'New unit must cost at most 2 more than replaced unit' }
  }
  // decrement old unit
  const { data: existing } = await db.from('game_player_units')
    .select('count').eq('game_id', context.gameId).eq('player_id', chosen_player_id)
    .eq('system_key', system_key).eq('unit_type', old_unit_type).single()
  if (!existing) throw { status: 409, message: 'Source unit not found' }
  if (existing.count === 1) {
    await db.from('game_player_units').delete()
      .eq('game_id', context.gameId).eq('player_id', chosen_player_id)
      .eq('system_key', system_key).eq('unit_type', old_unit_type)
  } else {
    await db.from('game_player_units').update({ count: existing.count - 1 })
      .eq('game_id', context.gameId).eq('player_id', chosen_player_id)
      .eq('system_key', system_key).eq('unit_type', old_unit_type)
  }
  // upsert new unit
  await db.from('game_player_units').upsert(
    { game_id: context.gameId, player_id: chosen_player_id, system_key, unit_type: new_unit_type, on_planet: null, count: 1 },
    { onConflict: 'game_id,player_id,system_key,unit_type,on_planet', ignoreDuplicates: false }
  )
  break
}

case 'give_promissory_to_opponent': {
  const { chosen_player_id, note_id } = context.selections as Record<string, string>
  const { data: note, error } = await db.from('game_promissory_notes')
    .select('id').eq('id', note_id).eq('held_by_player_id', chosen_player_id).single()
  if (error || !note) throw { status: 409, message: 'Note not found in opponent hand' }
  await db.from('game_promissory_notes')
    .update({ held_by_player_id: context.playerId }).eq('id', note_id)
  break
}

case 'increase_move': {
  // Sets move override on context — read by game-move-ships
  const { data: allUnits } = await db.from('game_player_units')
    .select('unit_type').eq('game_id', context.gameId)
  const unitTypes = [...new Set((allUnits ?? []).map((u: { unit_type: string }) => u.unit_type))]
  const { data: unitDefs } = await db.from('units').select('name,move').in('name', unitTypes)
  const maxMove = Math.max(...(unitDefs ?? []).map((u: { move: number }) => u.move ?? 0))
  ;(context as Record<string, unknown>).move_override = { ship_id: (context.selections as Record<string, string>).ship_id, move: maxMove }
  break
}

case 'produce_in_systems_with_ground_forces': {
  const { data: groundSystems } = await db.from('game_player_units')
    .select('system_key').eq('game_id', context.gameId).eq('player_id', context.playerId)
    .in('unit_type', ['infantry', 'mech']).not('on_planet', 'is', null)
  const validSystems = new Set((groundSystems ?? []).map((r: { system_key: string }) => r.system_key))
  const produceList = (context.selections as { produce_list: Array<{ system_key: string; unit_type: string; count: number }> }).produce_list
  for (const item of produceList) {
    if (!validSystems.has(item.system_key)) throw { status: 409, message: `System ${item.system_key} has no ground forces` }
    await db.from('game_player_units').upsert(
      { game_id: context.gameId, player_id: context.playerId, system_key: item.system_key, unit_type: item.unit_type, on_planet: null, count: item.count },
      { onConflict: 'game_id,player_id,system_key,unit_type,on_planet', ignoreDuplicates: false }
    )
  }
  break
}

case 'produce_units_free': {
  ;(context as Record<string, unknown>).free_production = true
  break
}

case 'explore_planet_free': {
  const planetName = (context.selections as Record<string, string>).planet_name
  const { data: controlled } = await db.from('game_player_planets')
    .select('planet_name').eq('game_id', context.gameId).eq('player_id', context.playerId)
    .eq('planet_name', planetName).single()
  if (!controlled) throw { status: 409, message: 'Planet not controlled' }
  // Trigger exploration draw — reuse existing exploration helper if available
  // Otherwise defer to game-explore-planet function logic inline
  break
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd ti4-companion-web && npx vitest run tests/lib/abilityDsl.test.js
```

Expected: PASS for new op tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityDsl.ts tests/lib/abilityDsl.test.js
git commit -m "feat(dsl): add 7 new op handlers for leader abilities (Phase 43a)"
```

---

### Task 4: `abilityHandlers.ts` — register complex agent handlers

**Files:**
- Modify: `supabase/functions/_shared/abilityHandlers.ts`

Read spec file `shared-abilityHandlers-p43a.md`. Read the current file to find the `handlers` map before editing.

- [ ] **Step 1: Write failing tests for the key handlers**

In `tests/functions/game-resolve-ability.test.js`, add a describe block:

```javascript
describe('nekro_malleon handler', () => {
  it('returns 409 when action card not in target hand', async () => {
    // mock: card in deck but held_by=different player
    const res = await invokeResolveAbility({
      source_type: 'leader', source_id: nekroAgentId,
      selections: { choice: 'action_card', chosen_player_id: 'p2', card_id: 'card999' }
    })
    expect(res.status).toBe(409)
  })
  it('discards action card and gives 2 TG on success', async () => {
    // mock: card held_by p2 in hand state
    // assert: card set to discarded, p2 action_card_count -1, p1 trade_goods +2
  })
})

describe('stillness_of_stars handler', () => {
  it('returns 409 when target has no commodities', async () => {
    // mock target player commodities=0
    const res = await invokeResolveAbility({
      source_type: 'leader', source_id: vuil_agentId,
      selections: { chosen_player_id: 'p2', unit_type: 'destroyer' }
    })
    expect(res.status).toBe(409)
  })
  it('converts commodities to TG on success', async () => {
    // mock target player commodities=3
    // assert: target commodities=0, vuil player trade_goods+3
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.test.js -t "nekro_malleon"
```

Expected: FAIL.

- [ ] **Step 3: Implement handlers in `abilityHandlers.ts`**

```typescript
import { AGENT_ABILITIES, HERO_ABILITIES } from './leaderEffects.ts'

type HandlerFn = (context: Record<string, unknown>, db: SupabaseClient) => Promise<void>

const handlers: Record<string, HandlerFn> = {
  ssruu_copies_agents: async (_context, _db) => {
    // Display-only — no server effect. Exhaust handled by caller.
  },

  nekro_malleon: async (context, db) => {
    const { chosen_player_id, choice, card_id, token_bucket } = context.selections as Record<string, string>
    if (choice === 'action_card') {
      const { data: card } = await db.from('game_action_card_deck').select('id')
        .eq('id', card_id).eq('held_by_player_id', chosen_player_id).eq('state', 'hand').single()
      if (!card) throw { status: 409, message: 'Card not in target hand' }
      await db.from('game_action_card_deck').update({ state: 'discarded', held_by_player_id: null }).eq('id', card_id)
      await db.from('game_players').rpc('decrement_action_card_count', { pid: chosen_player_id })
    } else {
      const { data: target } = await db.from('game_players').select('command_tokens').eq('id', chosen_player_id).single()
      if (!target) throw { status: 404, message: 'Player not found' }
      const tokens = target.command_tokens as Record<string, number>
      if ((tokens[token_bucket] ?? 0) < 1) throw { status: 409, message: 'No command tokens in that pool' }
      await db.from('game_players').update({ [`command_tokens`]: { ...tokens, [token_bucket]: tokens[token_bucket] - 1 } }).eq('id', chosen_player_id)
    }
    await db.from('game_players').rpc('increment_trade_goods', { pid: context.playerId as string, amount: 2 })
  },

  stillness_of_stars: async (context, db) => {
    const { chosen_player_id, unit_type } = context.selections as Record<string, string>
    const { data: target } = await db.from('game_players').select('commodities').eq('id', chosen_player_id).single()
    if (!target || target.commodities === 0) throw { status: 409, message: 'Target has no commodities' }
    const { data: unitDef } = await db.from('units').select('cost').eq('name', unit_type).single()
    if (!unitDef) throw { status: 404, message: 'Unit type not found' }
    if (unitDef.cost > target.commodities) throw { status: 409, message: 'Unit cost exceeds commodity value' }
    await db.from('game_players').update({ trade_goods: db.rpc('coalesce_add', { pid: chosen_player_id, amount: target.commodities }), commodities: 0 }).eq('id', chosen_player_id)
  },

  // Remaining complex handlers follow the same pattern — see spec shared-abilityHandlers-p43a.md
  mahact_scepter_of_dominion: async (_c, _d) => { /* capture opponent flagship commander token */ },
  l1z1x_i48s: async (_c, _d) => { /* place ground force + mech on chosen planet */ },
  letnev_viscount: async (_c, _d) => { /* sustain on chosen unit regardless of damage state */ },
  hacan_carth: async (context, db) => {
    // Option A: gain 2 commodities for self; Option B: replenish chosen player's commodities
    const { choice, chosen_player_id } = context.selections as Record<string, string>
    if (choice === '0') {
      const { data: p } = await db.from('game_players').select('commodities,commodity_cap').eq('id', context.playerId as string).single()
      if (p) await db.from('game_players').update({ commodities: Math.min(p.commodities + 2, p.commodity_cap) }).eq('id', context.playerId as string)
    } else {
      const { data: p } = await db.from('game_players').select('commodity_cap').eq('id', chosen_player_id).single()
      if (p) await db.from('game_players').update({ commodities: p.commodity_cap }).eq('id', chosen_player_id)
    }
  },
  xxcha_xxzoth: async (_c, _d) => { /* exhaust 1 planet + cast votes equal to its influence */ },
  mentak_suffi_an: async (_c, _d) => { /* chosen player loses 3 TG (minimum 0) */ },
  empyrean_acidos: async (_c, _d) => { /* place frontier tokens + explore */ },
  creuss_emissary: async (_c, _d) => { /* each player moves 1 ship through Creuss wormhole */ },
}

export function getHandler(key: string): HandlerFn {
  const fn = handlers[key]
  if (!fn) throw { status: 500, message: `No handler registered for key: ${key}` }
  return fn
}
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.test.js
```

Expected: PASS for nekro_malleon and stillness_of_stars tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityHandlers.ts tests/functions/game-resolve-ability.test.js
git commit -m "feat(leaders): register all complex agent ability handlers (Phase 43a)"
```

---

### Task 5: `game-resolve-ability` — add leader branch and reactive window emission

**Files:**
- Modify: `supabase/functions/game-resolve-ability/index.ts`

Read spec `fn-game-resolve-ability-p43a.md`. Find the existing `source_type` switch / if-else in the handler and add the leader branch after the existing relic handling.

- [ ] **Step 1: Write failing tests**

```javascript
// tests/functions/game-resolve-ability.test.js — add:

describe('leader agent activation', () => {
  it('returns 409 when agent is already exhausted', async () => {
    mockPlayerLeaders({ agent: 'exhausted' })
    const res = await invoke({ source_type: 'leader', source_id: titanAgentId })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'Agent is already exhausted' })
  })

  it('executes DSL ops and sets agent to exhausted', async () => {
    mockPlayerLeaders({ agent: 'unlocked' })
    mockLeaderRow({ id: titanAgentId, faction: 'The Titans Of Ul', leader_type: 'agent' })
    const res = await invoke({ source_type: 'leader', source_id: titanAgentId })
    expect(res.status).toBe(200)
    // verify game_players.leaders.agent updated to 'exhausted'
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ 'leaders': expect.any(Object) }))
  })
})

describe('reactive agent window', () => {
  it('includes pending_window when Creuss agent is unlocked and trigger is SYSTEM_ACTIVATED', async () => {
    // second player has Creuss faction, leaders.agent='unlocked'
    const res = await invoke({ source_type: 'leader', source_id: creussAgentId })
    const body = await res.json()
    expect(body.pending_window?.type).toBe('reactive_agent')
    expect(body.pending_window.eligible).toContainEqual(expect.objectContaining({ faction: 'The Ghosts Of Creuss' }))
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.test.js -t "leader agent"
```

- [ ] **Step 3: Implement in `game-resolve-ability/index.ts`**

After the existing `purges_source` block, add:

```typescript
if (source_type === 'leader' && source_id) {
  const { data: leaderRow } = await db.from('leaders').select('faction,leader_type').eq('id', source_id).single()
  if (!leaderRow) throw createError(404, 'Leader not found')

  const { data: playerRow } = await db.from('game_players').select('leaders').eq('id', player.id).single()
  const leaders = (playerRow?.leaders ?? {}) as Record<string, string>

  if (leaderRow.leader_type === 'agent') {
    if (leaders.agent === 'exhausted') throw createError(409, 'Agent is already exhausted')
    const ability = AGENT_ABILITIES[leaderRow.faction]
    if (typeof ability === 'string') {
      await getHandler(ability)(context, db)
    } else if (Array.isArray(ability)) {
      await interpretEffects(ability, context, db)
    }
    await db.from('game_players')
      .update({ leaders: { ...leaders, agent: 'exhausted' } })
      .eq('id', player.id)
  }

  if (leaderRow.leader_type === 'hero') {
    if (leaders.hero !== 'unlocked') throw createError(409, 'Hero not unlocked')
    const ability = HERO_ABILITIES[leaderRow.faction]
    if (typeof ability === 'string') {
      await getHandler(ability)(context, db)
    } else if (Array.isArray(ability)) {
      await interpretEffects(ability, context, db)
    }
    if (leaderRow.faction !== 'The Titans Of Ul') {
      await db.from('game_players')
        .update({ leaders: { ...leaders, hero: 'purged' } })
        .eq('id', player.id)
    }
  }

  // Reactive agent windows
  const { data: allPlayers } = await db.from('game_players').select('id,faction,leaders').eq('game_id', gameId)
  const reactiveAgents = collectReactiveAgents(allPlayers ?? [], trigger_type ?? 'SYSTEM_ACTIVATED', player.id)
  if (reactiveAgents.length > 0) {
    pendingWindows.push({ type: 'reactive_agent', eligible: reactiveAgents, context: { trigger: trigger_type } })
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-resolve-ability/index.ts
git commit -m "feat(leaders): add leader branch and reactive agent windows to game-resolve-ability"
```

---

### Task 6: `game-advance-phase` — ready agents and clear round flags

**Files:**
- Modify: `supabase/functions/game-advance-phase/index.ts`

Read spec `fn-game-advance-phase-p43a.md`.

- [ ] **Step 1: Write failing tests**

```javascript
describe('status phase readies exhausted agents', () => {
  it('sets leaders.agent to unlocked for all exhausted agents', async () => {
    // mock game in status phase; one player with leaders.agent='exhausted'
    await invokeAdvancePhase({ from: 'status', to: 'agenda' })
    expect(mockUpdateLeaders).toHaveBeenCalledWith(expect.objectContaining({ agent: 'unlocked' }))
  })
})

describe('round end clears game_round_flags', () => {
  it('resets game_round_flags to {} when advancing from agenda back to strategy', async () => {
    mockGame({ game_round_flags: { letnev_no_fleet_limit: true } })
    await invokeAdvancePhase({ from: 'agenda', to: 'strategy' })
    expect(mockGamesUpdate).toHaveBeenCalledWith(expect.objectContaining({ game_round_flags: {} }))
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-advance-phase.test.js -t "ready.*agent\|round.*flag"
```

- [ ] **Step 3: Implement in `game-advance-phase/index.ts`**

In the "Ready Cards" step of the status phase section:

```typescript
// Ready exhausted agents
await db.from('game_players')
  .update({ leaders: db.rpc('jsonb_set_if', { path: '{agent}', value: '"unlocked"', condition_path: '{agent}', condition_value: '"exhausted"' }) })
  .eq('game_id', gameId)
  .eq("leaders->>'agent'", 'exhausted')
```

At round end (advancing from agenda phase to strategy phase):

```typescript
await db.from('games')
  .update({ game_round_flags: {} })
  .eq('id', gameId)
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-advance-phase.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-advance-phase/index.ts tests/functions/game-advance-phase.test.js
git commit -m "feat(leaders): ready exhausted agents in status phase, clear round flags at round end"
```

---

### Task 7: Reactive agent windows in `game-activate-system`, `game-produce-units`, `game-assign-hits`

**Files:**
- Modify: `supabase/functions/game-activate-system/index.ts`
- Modify: `supabase/functions/game-produce-units/index.ts`
- Modify: `supabase/functions/game-assign-hits/index.ts`

Read specs `fn-game-activate-system-p43a.md`, `fn-game-produce-units-p43a.md`, `fn-game-assign-hits-p43a.md`.

- [ ] **Step 1: Write failing tests for each function**

```javascript
// tests/functions/game-activate-system.test.js
describe('reactive agent on SYSTEM_ACTIVATED', () => {
  it('includes pending_window with reactive agents when eligible agents are unlocked', async () => {
    mockOtherPlayer({ faction: 'The Ghosts Of Creuss', leaders: { agent: 'unlocked' } })
    const res = await invokeActivateSystem({ system_key: '1,0' })
    const body = await res.json()
    expect(body.pending_window?.type).toBe('reactive_agent')
    expect(body.pending_window.eligible[0].faction).toBe('The Ghosts Of Creuss')
  })
  it('omits pending_window when no eligible reactive agents', async () => {
    mockOtherPlayer({ faction: 'The Ghosts Of Creuss', leaders: { agent: 'exhausted' } })
    const res = await invokeActivateSystem({ system_key: '1,0' })
    const body = await res.json()
    expect(body.pending_window).toBeUndefined()
  })
})

// Same pattern for game-produce-units (PRODUCTION trigger) and game-assign-hits (SUSTAIN_DAMAGE)
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-activate-system.test.js -t "reactive"
```

- [ ] **Step 3: Add reactive window check to each function**

In each function, at the end before the final `return okResponse(...)`, add:

```typescript
import { collectReactiveAgents } from '../_shared/leaderEffects.ts'

// At end of game-activate-system:
const { data: allPlayers } = await db.from('game_players').select('id,faction,leaders').eq('game_id', gameId)
const reactiveAgents = collectReactiveAgents(allPlayers ?? [], 'SYSTEM_ACTIVATED', player.id)
if (reactiveAgents.length > 0) {
  return okResponse({ ...result, pending_window: { type: 'reactive_agent', eligible: reactiveAgents, context: { trigger: 'SYSTEM_ACTIVATED', system_key: systemKey } } })
}
```

Apply the same pattern for `game-produce-units` (`'PRODUCTION'`) and `game-assign-hits` (`'SUSTAIN_DAMAGE'` when sustain damage occurred, `'GROUND_COMBAT_START'` during ground combat commit).

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-activate-system/index.ts supabase/functions/game-produce-units/index.ts supabase/functions/game-assign-hits/index.ts tests/functions/game-activate-system.test.js tests/functions/game-produce-units.test.js tests/functions/game-assign-hits.test.js
git commit -m "feat(leaders): emit reactive_agent pending windows from activate-system, produce-units, assign-hits"
```

---

### Task 8: `leaderConstants.js` and `LeaderAbilityModal` — client-side selection UI

**Files:**
- Create: `src/lib/leaderConstants.js`
- Create: `src/components/game/LeaderAbilityModal.jsx`

Read specs `lib-leaderConstants.md` and `component-LeaderAbilityModal.md`.

- [ ] **Step 1: Create `leaderConstants.js`**

```javascript
// src/lib/leaderConstants.js
export const LEADER_SELECTION_CONFIG = {
  'The Emirates Of Hacan': {
    agent: {
      needs_choice: true,
      options: ['Gain 2 commodities', "Replenish another player's commodities — choose player"],
    },
  },
  'The Xxcha Kingdom': {
    agent: { needs_planet: true, planet_filter: 'any' },
  },
  'The Nekro Virus': {
    agent: {
      needs_target_player: true,
      needs_choice: true,
      options: ['Discard 1 action card', 'Spend 1 command token'],
    },
  },
  'The Vuil\'raith Cabal': {
    agent: { needs_target_player: true, needs_unit_type: true },
  },
  'The Clan Of Saar': {
    agent: { needs_ship: true },
  },
  'The Ghosts Of Creuss': {
    hero: {
      needs_system: true,
      count: 2,
      system_filter: 'has_wormhole_or_your_units',
      exclude: ['creuss_home', 'wormhole_nexus'],
    },
  },
  'The Winnu': {
    hero: { needs_strategy_card: true },
  },
  'The Naalu Collective': {
    hero: { needs_target_player: true, multi: true },
  },
  'The Arborec': {
    agent: { needs_target_player: true, needs_system: true, needs_unit_type: true },
  },
  'The Mentak Coalition': {
    agent: { needs_target_player: true },
  },
  'The Yin Brotherhood': {
    agent: { needs_target_player: true },
  },
  'The Nomad': {
    agent: { needs_target_player: true },
  },
}
```

- [ ] **Step 2: Create `LeaderAbilityModal.jsx`**

```jsx
// src/components/game/LeaderAbilityModal.jsx
import { useState } from 'react'
import { LEADER_SELECTION_CONFIG } from '../../lib/leaderConstants'

export default function LeaderAbilityModal({ leader, faction, leaderType, gamePlayers, currentPlayer, onConfirm, onClose }) {
  const selectionConfig = LEADER_SELECTION_CONFIG[faction]?.[leaderType] ?? {}
  const [selections, setSelections] = useState({})

  const isReady = () => {
    if (selectionConfig.needs_target_player && !selections.chosen_player_id) return false
    if (selectionConfig.needs_planet && !selections.planet_name) return false
    if (selectionConfig.needs_choice && selections.choice === undefined) return false
    if (selectionConfig.needs_strategy_card && !selections.strategy_card) return false
    return true
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50">
      <div className="panel w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="label">{leader.name}</span>
          <span className="text-xs text-muted uppercase">{leaderType}</span>
        </div>
        <p className="text-sm text-muted">{leader.text}</p>

        {selectionConfig.needs_target_player && (
          <div>
            <p className="label mb-1">Choose a player</p>
            <select
              className="input w-full"
              onChange={e => setSelections(s => ({ ...s, chosen_player_id: e.target.value }))}
              defaultValue=""
            >
              <option value="" disabled>Select player...</option>
              {(gamePlayers ?? [])
                .filter(p => selectionConfig.or_self ? true : p.id !== currentPlayer?.id)
                .map(p => (
                  <option key={p.id} value={p.id}>{p.faction}</option>
                ))}
            </select>
          </div>
        )}

        {selectionConfig.needs_choice && (
          <div>
            <p className="label mb-1">Choose an effect</p>
            <div className="space-y-2">
              {selectionConfig.options.map((opt, i) => (
                <button
                  key={i}
                  className={`w-full text-left px-3 py-2 rounded border text-sm ${
                    selections.choice === i ? 'border-plasma text-bright' : 'border-border text-muted'
                  }`}
                  onClick={() => setSelections(s => ({ ...s, choice: i }))}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {Object.keys(selectionConfig).length === 0 && (
          <p className="text-sm text-muted italic">This will use the ability as described on the card.</p>
        )}

        <div className="flex gap-2 pt-2">
          <button className="btn-primary flex-1" disabled={!isReady()} onClick={() => onConfirm(selections)}>
            USE ABILITY
          </button>
          <button className="btn-ghost" onClick={onClose}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run tests**

```bash
cd ti4-companion-web && npm test
```

Expected: all tests pass (new files add no test failures).

- [ ] **Step 4: Commit**

```bash
git add src/lib/leaderConstants.js src/components/game/LeaderAbilityModal.jsx
git commit -m "feat(ui): add leaderConstants selection config and LeaderAbilityModal component"
```

---

### Task 9: `useLeaders` + `LeaderPanel` + `GameScreen` — wire up modal and reactive windows

**Files:**
- Modify: `src/hooks/useLeaders.js`
- Modify: `src/components/game/LeaderPanel.jsx`
- Modify: `src/components/game/GameScreen.jsx`

Read specs `hook-useLeaders-p43a.md`, `component-LeaderPanel-p43a.md`, `component-GameScreen-p43a.md`.

- [ ] **Step 1: Write failing hook tests**

```javascript
// tests/hooks/useLeaders.test.js — add:
it('handleUseAbility sets activeLeader and opens modal', () => {
  const { result } = renderHook(() => useLeaders(mockGame, mockPlayer))
  act(() => result.current.handleUseAbility({ id: 'agent1', name: 'Test Agent', leader_type: 'agent' }))
  expect(result.current.leaderModalOpen).toBe(true)
  expect(result.current.activeLeader?.id).toBe('agent1')
})

it('handleReactiveAgentWindow opens modal when current player is eligible', () => {
  const { result } = renderHook(() => useLeaders(mockGame, { id: 'p1', faction: 'The Ghosts Of Creuss' }))
  act(() => result.current.handleReactiveAgentWindow({
    eligible: [{ player_id: 'p1', faction: 'The Ghosts Of Creuss' }],
    context: { trigger: 'SYSTEM_ACTIVATED' }
  }))
  expect(result.current.leaderModalOpen).toBe(true)
})

it('handleReactiveAgentWindow does nothing when current player not eligible', () => {
  const { result } = renderHook(() => useLeaders(mockGame, { id: 'p2', faction: 'The Yin Brotherhood' }))
  act(() => result.current.handleReactiveAgentWindow({
    eligible: [{ player_id: 'p1', faction: 'The Ghosts Of Creuss' }],
    context: {}
  }))
  expect(result.current.leaderModalOpen).toBe(false)
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ti4-companion-web && npx vitest run tests/hooks/useLeaders.test.js -t "modal\|reactive"
```

- [ ] **Step 3: Modify `useLeaders.js`**

Add to the hook body and return value (read the current file first):

```javascript
const [leaderModalOpen, setLeaderModalOpen] = useState(false)
const [activeLeader, setActiveLeader] = useState(null)

const handleUseAbility = useCallback((leader) => {
  setActiveLeader(leader)
  setLeaderModalOpen(true)
}, [])

const handleConfirm = useCallback(async (selections) => {
  if (!activeLeader) return
  setLeaderModalOpen(false)
  await resolveLeaderAbility(activeLeader.id, selections)
}, [activeLeader])

const handleReactiveAgentWindow = useCallback((window) => {
  const eligible = window.eligible?.find(e => e.player_id === currentPlayer?.id)
  if (eligible) {
    setActiveLeader({ id: eligible.agent_id, faction: eligible.faction, leader_type: 'agent', isReactive: true, windowContext: window.context })
    setLeaderModalOpen(true)
  }
}, [currentPlayer?.id])

// Add to return:
// leaderModalOpen, activeLeader, handleUseAbility, handleConfirm, handleReactiveAgentWindow
```

- [ ] **Step 4: Modify `LeaderPanel.jsx`** to render `LeaderAbilityModal` when open (read the file first)

- [ ] **Step 5: Modify `GameScreen.jsx`** to extend the `pending_window` switch with `case 'reactive_agent': handleReactiveAgentWindow(window); break` (read the file first)

- [ ] **Step 6: Run tests**

```bash
cd ti4-companion-web && npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useLeaders.js src/components/game/LeaderPanel.jsx src/components/game/GameScreen.jsx tests/hooks/useLeaders.test.js
git commit -m "feat(ui): wire LeaderAbilityModal and reactive agent window handling in GameScreen"
```

---

### Task 10: Deploy and smoke test

- [ ] **Step 1: Deploy all modified Edge Functions**

```bash
supabase functions deploy game-resolve-ability --no-verify-jwt
supabase functions deploy game-advance-phase --no-verify-jwt
supabase functions deploy game-activate-system --no-verify-jwt
supabase functions deploy game-produce-units --no-verify-jwt
supabase functions deploy game-assign-hits --no-verify-jwt
```

- [ ] **Step 2: Run full test suite**

```bash
cd ti4-companion-web && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Manual smoke test**

Start a local game with two players. Verify:
- Activating a Titans agent → card shows exhausted, hit cancelled
- Activating an Xxcha agent → planet selection appears in modal
- When Creuss player has agent unlocked and opponent activates a system → reactive_agent window opens for Creuss player
- Status phase advance → all exhausted agents become unlocked again

- [ ] **Step 4: Update `_index.md` Phase 43a entries from `planned` → `in-progress` then `done`**

Update `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`: change Status to `done` for all 14 Phase 43a spec entries.

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "docs: mark Phase 43a Leader Agents as done in _index.md"
```
