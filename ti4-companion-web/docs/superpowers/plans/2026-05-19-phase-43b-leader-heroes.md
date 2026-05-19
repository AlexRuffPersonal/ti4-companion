# Phase 43b — Leader Card Abilities: Heroes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the `HERO_ABILITIES` registry for all 24 factions, implement named handlers for complex hero abilities, and extend `leaderConstants.js` with hero-specific selection config — completing hero activation (purge on use, Titans special-case preserved).

**Architecture:** Phase 43a already wired the hero branch in `game-resolve-ability` (purge logic, `HERO_ABILITIES` lookup, Titans skip-purge). Phase 43b only populates data and handlers. `fn-game-advance-phase` and `game-resolve-ability` need no structural changes — the `game_round_flags` reset added in 43a already handles Letnev and Nomad hero state. UI changes are limited to new `LEADER_SELECTION_CONFIG` entries in `leaderConstants.js` (no modal component changes needed).

**Tech Stack:** Deno/TypeScript (Edge Functions), React 19 + Tailwind CSS 3 (web), Vitest (tests)

---

## Files

| File | Action |
|------|--------|
| `supabase/functions/_shared/leaderEffects.ts` | Modify — populate `HERO_ABILITIES` for all 24 factions |
| `supabase/functions/_shared/abilityHandlers.ts` | Modify — register all complex hero handlers |
| `supabase/functions/game-resolve-ability/index.ts` | Verify only — confirm 43a hero branch handles all 24 factions correctly |
| `supabase/functions/game-advance-phase/index.ts` | Verify only — confirm round-flag reset covers hero flags |
| `src/components/game/LeaderAbilityModal.jsx` | Verify only — no structural changes; driven by config |
| `src/lib/leaderConstants.js` | Modify — add hero selection config entries |
| `tests/functions/game-resolve-ability.test.js` | Modify — add hero-specific describe blocks |

---

### Task 1: Populate `HERO_ABILITIES` in `leaderEffects.ts`

**Files:**
- Modify: `supabase/functions/_shared/leaderEffects.ts`

Read the spec `shared-leaderEffects-p43b.md` for the full registry. Read the current `leaderEffects.ts` to find the `HERO_ABILITIES` object.

- [ ] **Step 1: Replace the empty `HERO_ABILITIES` object**

```typescript
export const HERO_ABILITIES: Record<string, Op[] | string> = {
  'The Mahact Gene-Sorcerers':   'mahact_hero',
  'The Argent Flight':           'argent_hero',
  'The Nekro Virus':             'nekro_hero',
  'The Titans Of Ul':            'titans_hero',
  'The Vuil\'raith Cabal':       'vuil_raith_hero',
  'The Embers Of Muaat':         'muaat_hero',
  'The L1Z1X Mindnet':           [{ op: 'move_flagship_and_dreadnoughts', target: 'chosen_system' }],
  'The Naaz-Rokha Alliance':     'naaz_rokha_hero',
  'The Federation Of Sol':       [{ op: 'reclaim_command_tokens' }],
  'The Clan Of Saar':            'saar_hero',
  'The Barony Of Letnev':        'letnev_darktalon',
  'The Universities Of Jol-Nar': 'jol_nar_hero',
  'The Yin Brotherhood':         'yin_hero',
  'The Emirates Of Hacan':       [{ op: 'produce_units_free' }],
  'The Winnu':                   'winnu_mathis',
  'The Nomad':                   'nomad_ahk_syl',
  'The Yssaril Tribes':          'yssaril_kyver',
  'The Arborec':                 [{ op: 'produce_in_systems_with_ground_forces' }],
  'The Naalu Collective':        'naalu_oracle',
  'The Xxcha Kingdom':           'xxcha_xxekir',
  'The Mentak Coalition':        'mentak_hero',
  'The Empyrean':                'empyrean_hero',
  'Sardakk N\'orr':              'sardakk_hero',
  'The Ghosts Of Creuss':        'creuss_riftwalker',
}
```

- [ ] **Step 2: Run existing tests**

```bash
cd ti4-companion-web && npm test
```

Expected: all pass (registry is data-only; no structural change).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/leaderEffects.ts
git commit -m "feat(leaders): populate HERO_ABILITIES registry for all 24 factions (Phase 43b)"
```

---

### Task 2: Register complex hero handlers in `abilityHandlers.ts`

**Files:**
- Modify: `supabase/functions/_shared/abilityHandlers.ts`

Read spec `shared-abilityHandlers-p43b.md` for pseudocode of each handler. Add handlers after the existing agent handler entries.

- [ ] **Step 1: Write failing tests for key handlers**

```javascript
// tests/functions/game-resolve-ability.test.js — add:

describe('creuss_riftwalker hero', () => {
  it('returns 409 when a system key is not in the map', async () => {
    mockGame({ map_tiles: { '1,0': 'tile_a' } })
    const res = await invokeHero('The Ghosts Of Creuss', { system_keys: ['1,0', '99,99'] })
    expect(res.status).toBe(409)
  })
  it('swaps two system tiles in map_tiles', async () => {
    mockGame({ map_tiles: { '1,0': 'tile_a', '2,0': 'tile_b', '3,0': 'tile_c' } })
    const res = await invokeHero('The Ghosts Of Creuss', { system_keys: ['1,0', '2,0'] })
    expect(res.status).toBe(200)
    // verify map_tiles['1,0'] === 'tile_b' and map_tiles['2,0'] === 'tile_a'
    expect(mockGamesUpdate).toHaveBeenCalledWith(expect.objectContaining({
      map_tiles: expect.objectContaining({ '1,0': 'tile_b', '2,0': 'tile_a' })
    }))
  })
})

describe('letnev_darktalon hero', () => {
  it('sets game_round_flags.letnev_no_fleet_limit to true', async () => {
    mockGame({ game_round_flags: {} })
    const res = await invokeHero('The Barony Of Letnev', {})
    expect(res.status).toBe(200)
    expect(mockGamesUpdate).toHaveBeenCalledWith(expect.objectContaining({
      game_round_flags: expect.objectContaining({ letnev_no_fleet_limit: true })
    }))
  })
})

describe('mahact_hero hero', () => {
  it('moves units and inserts game_combats row', async () => {
    mockUnits({ system_key: '0,0', on_planet: null, unit_type: 'flagship' })
    const res = await invokeHero('The Mahact Gene-Sorcerers', {
      source_system_key: '0,0', dest_system_key: '1,0', target_player_id: 'p2'
    })
    expect(res.status).toBe(200)
    expect(mockCombatsInsert).toHaveBeenCalledWith(expect.objectContaining({
      no_retreat: true, attacker_player_id: mockPlayer.id
    }))
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.test.js -t "creuss_riftwalker\|letnev_darktalon\|mahact_hero"
```

Expected: FAIL.

- [ ] **Step 3: Implement handlers in `abilityHandlers.ts`**

Add after existing agent handlers (read current file first to find insertion point):

```typescript
creuss_riftwalker: async (context, db) => {
  const [key1, key2] = (context.selections as { system_keys: string[] }).system_keys
  if (!key1 || !key2) throw { status: 400, message: 'Two system keys required' }
  const { data: game } = await db.from('games').select('map_tiles').eq('id', context.gameId).single()
  if (!game) throw { status: 404, message: 'Game not found' }
  const tiles = game.map_tiles as Record<string, unknown>
  if (!tiles[key1]) throw { status: 409, message: `System ${key1} not found in map` }
  if (!tiles[key2]) throw { status: 409, message: `System ${key2} not found in map` }
  const newTiles = { ...tiles, [key1]: tiles[key2], [key2]: tiles[key1] }
  await db.from('games').update({ map_tiles: newTiles }).eq('id', context.gameId)
},

letnev_darktalon: async (context, db) => {
  const { data: game } = await db.from('games').select('game_round_flags').eq('id', context.gameId).single()
  const flags = ((game?.game_round_flags ?? {}) as Record<string, unknown>)
  await db.from('games').update({ game_round_flags: { ...flags, letnev_no_fleet_limit: true } }).eq('id', context.gameId)
},

nomad_ahk_syl: async (context, db) => {
  const { data: game } = await db.from('games').select('game_round_flags').eq('id', context.gameId).single()
  const flags = ((game?.game_round_flags ?? {}) as Record<string, unknown>)
  await db.from('games').update({ game_round_flags: { ...flags, nomad_flagship_ignores_tokens: true } }).eq('id', context.gameId)
},

mahact_hero: async (context, db) => {
  const { source_system_key, dest_system_key, target_player_id } = context.selections as Record<string, string>
  const { data: units } = await db.from('game_player_units')
    .select('id').eq('game_id', context.gameId).eq('player_id', context.playerId)
    .eq('system_key', source_system_key).is('on_planet', null)
  if (!units || units.length === 0) throw { status: 409, message: 'No ships in source system' }
  for (const unit of units) {
    await db.from('game_player_units').update({ system_key: dest_system_key }).eq('id', unit.id)
  }
  await db.from('game_combats').insert({
    game_id: context.gameId,
    system_key: dest_system_key,
    attacker_player_id: context.playerId,
    defender_player_id: target_player_id,
    combat_phase: 'pre_combat',
    no_retreat: true,
    no_movement_abilities: true,
  })
},

titans_hero: async (context, db) => {
  await db.from('game_player_planets').update({
    titans_hero_attached: true,
    resource_bonus: 3,
    influence_bonus: 3,
  }).eq('game_id', context.gameId).eq('planet_name', 'Elysium')
  // Note: caller (game-resolve-ability) skips purge write for Titans
},

// Remaining heroes — implement each following the same pattern per spec shared-abilityHandlers-p43b.md:
argent_hero: async (_c, _d) => { /* move ships to systems containing your command tokens */ },
nekro_hero: async (_c, _d) => { /* choose planet with tech specialty; gain that tech */ },
muaat_hero: async (_c, _d) => { /* destroy own units, replace system tile with supernova */ },
naaz_rokha_hero: async (_c, _d) => { /* gain relic; perform 2 strategy card secondaries */ },
saar_hero: async (_c, _d) => { /* destroy infantry/fighters in adjacent system */ },
jol_nar_hero: async (_c, _d) => { /* swap non-unit-upgrade tech with another player */ },
yin_hero: async (_c, _d) => { /* for each planet with infantry: ready it or double infantry */ },
yssaril_kyver: async (_c, _d) => { /* each player reveals 1 action card */ },
naalu_oracle: async (_c, _d) => { /* each opponent gives 1 promissory note to Naalu */ },
xxcha_xxekir: async (_c, _d) => { /* purge own political favor; exhaust all Xxcha planets for influence votes */ },
mentak_hero: async (_c, _d) => { /* at start of combat: copy destroyed enemy ships as own */ },
empyrean_hero: async (_c, _d) => { /* place frontier tokens in systems; explore each */ },
sardakk_hero: async (_c, _d) => { /* skip to commit ground forces; all units get +1 combat */ },
vuil_raith_hero: async (context, db) => {
  // All players roll for each non-fighter ship in/adjacent to dimensional tear systems
  const { data: tearSystems } = await db.from('game_system_state')
    .select('system_key').eq('game_id', context.gameId).eq('dimensional_tear', true)
  const tearKeys = (tearSystems ?? []).map((r: { system_key: string }) => r.system_key)
  if (tearKeys.length === 0) throw { status: 409, message: 'No dimensional tear systems' }
  const { data: players } = await db.from('game_players').select('id,faction').eq('game_id', context.gameId)
  const results: Array<{ player_id: string; rolls: Array<{ unit_type: string; roll: number; captured: boolean }> }> = []
  for (const p of (players ?? [])) {
    if (p.id === context.playerId) continue
    const { data: ships } = await db.from('game_player_units').select('unit_type')
      .eq('game_id', context.gameId).eq('player_id', p.id)
      .in('system_key', tearKeys).neq('unit_type', 'fighter').is('on_planet', null)
    const rolls = (ships ?? []).map((s: { unit_type: string }) => {
      const roll = Math.floor(Math.random() * 10) + 1
      return { unit_type: s.unit_type, roll, captured: roll <= 3 }
    })
    results.push({ player_id: p.id, rolls })
  }
  ;(context as Record<string, unknown>).capture_results = results
},
winnu_mathis: async (_c, _d) => { /* apply chosen strategy card primary; mark secondary for chosen players */ },
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-ability.test.js
```

Expected: PASS for all implemented hero handlers.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/abilityHandlers.ts tests/functions/game-resolve-ability.test.js
git commit -m "feat(leaders): register complex hero ability handlers (Phase 43b)"
```

---

### Task 3: Add hero selection config to `leaderConstants.js`

**Files:**
- Modify: `src/lib/leaderConstants.js`

Read spec `component-LeaderAbilityModal-p43b.md`. Read the current `leaderConstants.js` to find where to add hero entries.

- [ ] **Step 1: Add hero config entries**

Extend `LEADER_SELECTION_CONFIG` with hero-specific entries:

```javascript
// Add/extend these entries (some factions may already have an agent entry):
'The Ghosts Of Creuss': {
  // agent entry already present
  hero: {
    needs_system: true,
    count: 2,
    system_filter: 'has_wormhole_or_your_units',
    exclude: ['creuss_home', 'wormhole_nexus'],
  },
},
'The Mahact Gene-Sorcerers': {
  hero: {
    needs_system: true,
    count: 2,
    system_labels: ['Source system (your ships)', 'Destination system'],
    needs_target_player: true,
  },
},
'The Winnu': {
  hero: { needs_strategy_card: true },
},
'The Naalu Collective': {
  hero: {
    needs_target_player: true,
    multi: true,
    label: 'Each opponent must give you 1 promissory note',
  },
},
'The Yssaril Tribes': {
  hero: {
    auto_multi_player: true,
    label: 'Each player reveals 1 action card from their hand',
  },
},
'The Arborec': {
  hero: {
    needs_system: true,
    count: 1,
    system_filter: 'has_your_ground_forces',
    label: 'Choose a planet system to produce in',
  },
},
'The Vuil\'raith Cabal': {
  hero: {
    // No selections needed — auto-rolls for all ships near dimensional tears
    label: 'All non-fighter ships near Dimensional Tear systems will be rolled against.',
  },
},
```

- [ ] **Step 2: Run tests**

```bash
cd ti4-companion-web && npm test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/leaderConstants.js
git commit -m "feat(ui): add hero selection config entries to leaderConstants (Phase 43b)"
```

---

### Task 4: Verify end-to-end hero flow and confirm round-flag clearing

**Files:**
- Verify: `supabase/functions/game-advance-phase/index.ts`

- [ ] **Step 1: Add round-flag clearing test for hero flags**

```javascript
// tests/functions/game-advance-phase.test.js — add:
describe('round end clears hero round flags', () => {
  it('resets letnev_no_fleet_limit and nomad_flagship_ignores_tokens at round end', async () => {
    mockGame({ game_round_flags: { letnev_no_fleet_limit: true, nomad_flagship_ignores_tokens: true } })
    await invokeAdvancePhase({ from: 'agenda', to: 'strategy' })
    expect(mockGamesUpdate).toHaveBeenCalledWith(expect.objectContaining({ game_round_flags: {} }))
  })
})
```

- [ ] **Step 2: Run test to confirm pass (no code change needed)**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-advance-phase.test.js -t "hero round flags"
```

Expected: PASS (the reset was added in Phase 43a).

- [ ] **Step 3: Run full suite**

```bash
cd ti4-companion-web && npm test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/functions/game-advance-phase.test.js
git commit -m "test(leaders): verify hero round-flag clearing in game-advance-phase (Phase 43b)"
```

---

### Task 5: Deploy and smoke test

- [ ] **Step 1: Deploy modified Edge Functions**

```bash
supabase functions deploy game-resolve-ability --no-verify-jwt
```

- [ ] **Step 2: Manual smoke test — key hero paths**

- Activate Sol hero → `reclaim_command_tokens` fires, `leaders.hero` set to `purged`
- Activate Creuss hero → system selection modal appears, two wormhole tiles swap in map
- Activate Letnev hero → `game_round_flags.letnev_no_fleet_limit: true` set; advance to next round → flag cleared
- Activate Titans hero → `Elysium` planet row gains `titans_hero_attached: true`; no purge

- [ ] **Step 3: Update `_index.md` Phase 43b entries to `done`**

Change status for all 5 Phase 43b spec entries in `_index.md`.

- [ ] **Step 4: Commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "docs: mark Phase 43b Leader Heroes as done in _index.md"
```
