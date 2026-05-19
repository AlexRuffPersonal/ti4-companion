# Phase 43c — Leader Card Abilities: Commander Passives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement commander unlock checking (`game-unlock-commander`), populate the `COMMANDER_PASSIVES` registry for all 24 factions, wire passive hooks into 14 Edge Functions, add the Jol-Nar Ta Zern reroll modal (`CommanderRerollModal`), and expose the CHECK UNLOCK button via `useLeaders` and `LeaderPanel`.

**Architecture:** New `commanderUnlock.ts` contains `checkCommanderUnlock(faction, gameId, player, db)` with a faction switch for all 24 unlock conditions. New Edge Function `game-unlock-commander` calls it and writes `leaders.commander='unlocked'`. Commander passives use the existing `applyCommanderPassives(trigger, context, db)` stub in `leaderEffects.ts` — Phase 43c populates `COMMANDER_PASSIVES` and implements the function body. Passive hooks are added to 14 Edge Functions using the same reactive-window pattern from Phase 43a. The Jol-Nar `commander_reroll` window flows through `GameScreen` → `CommanderRerollModal` → `game-resolve-commander-reroll`.

**Tech Stack:** Deno/TypeScript (Edge Functions), React 19 + Tailwind CSS 3 (web), Vitest (tests)

**Prerequisites:** Phases 43a and 43b must be complete (migration 052 applied, `leaderEffects.ts` exists, agent/hero branches in `game-resolve-ability` working).

---

## Files

| File | Action |
|------|--------|
| `supabase/functions/_shared/commanderUnlock.ts` | Create |
| `supabase/functions/game-unlock-commander/index.ts` | Create |
| `supabase/functions/_shared/leaderEffects.ts` | Modify — populate `COMMANDER_PASSIVES` + implement `applyCommanderPassives` |
| `supabase/functions/_shared/abilityHandlers.ts` | Modify — register commander passive handlers |
| `supabase/functions/game-produce-units/index.ts` | Modify — call `applyCommanderPassives('PRODUCTION', ...)` |
| `supabase/functions/game-research-technology/index.ts` | Modify — call `applyCommanderPassives('TECH_RESEARCHED', ...)` |
| `supabase/functions/game-assign-hits/index.ts` | Modify — call `applyCommanderPassives('SUSTAIN_DAMAGE', ...)` |
| `supabase/functions/game-commit-ground-forces/index.ts` | Modify — call `applyCommanderPassives('GROUND_COMBAT_START', ...)` |
| `supabase/functions/game-roll-combat-dice/index.ts` | Modify — call `applyCommanderPassives('COMBAT_ROLL', ...)` |
| `supabase/functions/game-roll-ground-combat-dice/index.ts` | Modify — call `applyCommanderPassives('COMBAT_ROLL', ...)` |
| `supabase/functions/game-fire-bombardment/index.ts` | Modify — call `applyCommanderPassives('BOMBARDMENT', ...)` |
| `supabase/functions/game-fire-space-cannon/index.ts` | Modify — call `applyCommanderPassives('UNIT_ABILITY_ROLL', ...)` |
| `supabase/functions/game-fire-anti-fighter-barrage/index.ts` | Modify — call `applyCommanderPassives('UNIT_ABILITY_ROLL', ...)` |
| `supabase/functions/game-activate-system/index.ts` | Modify — call `applyCommanderPassives('SYSTEM_ACTIVATED', ...)` |
| `supabase/functions/game-move-ships/index.ts` | Modify — call `applyCommanderPassives('SHIPS_MOVED', ...)` |
| `supabase/functions/game-play-strategy-card/index.ts` | Modify — call `applyCommanderPassives('STRATEGY_TOKEN_SPENT', ...)` |
| `supabase/functions/game-cast-votes/index.ts` | Modify — call `applyCommanderPassives('CAST_VOTES', ...)` |
| `supabase/functions/game-resolve-commander-reroll/index.ts` | Create |
| `src/lib/edgeFunctions.js` | Modify — add `unlockCommander` + `resolveCommanderReroll` wrappers |
| `src/hooks/useLeaders.js` | Modify — add unlock + reroll modal state |
| `src/components/game/CommanderRerollModal.jsx` | Create |
| `src/components/game/GameScreen.jsx` | Modify — route `commander_reroll` and `commander_passive` windows |
| `tests/functions/game-unlock-commander.test.js` | Create |
| `tests/functions/game-resolve-commander-reroll.test.js` | Create |
| `tests/hooks/useLeaders.test.js` | Modify — unlock + reroll tests |

---

### Task 1: `commanderUnlock.ts` — 24 faction unlock conditions

**Files:**
- Create: `supabase/functions/_shared/commanderUnlock.ts`

Read spec `shared-commanderUnlock.md` for all 24 faction conditions.

- [ ] **Step 1: Write failing tests**

```javascript
// tests/functions/game-unlock-commander.test.js
import { checkCommanderUnlock } from '../../../supabase/functions/_shared/commanderUnlock.ts'

describe('checkCommanderUnlock', () => {
  it('Nekro — false when < 3 techs', async () => {
    const player = { id: 'p1', technologies: ['tech1', 'tech2'] }
    expect(await checkCommanderUnlock('The Nekro Virus', 'g1', player, mockDb)).toBe(false)
  })
  it('Nekro — true when >= 3 techs', async () => {
    const player = { id: 'p1', technologies: ['tech1', 'tech2', 'tech3'] }
    expect(await checkCommanderUnlock('The Nekro Virus', 'g1', player, mockDb)).toBe(true)
  })
  it('Hacan — false when trade_goods < 10', async () => {
    const player = { id: 'p1', trade_goods: 9 }
    expect(await checkCommanderUnlock('The Emirates Of Hacan', 'g1', player, mockDb)).toBe(false)
  })
  it('Hacan — true when trade_goods >= 10', async () => {
    const player = { id: 'p1', trade_goods: 10 }
    expect(await checkCommanderUnlock('The Emirates Of Hacan', 'g1', player, mockDb)).toBe(true)
  })
  it('Jol-Nar — false when < 8 techs', async () => {
    const player = { id: 'p1', technologies: Array(7).fill('x') }
    expect(await checkCommanderUnlock('The Universities Of Jol-Nar', 'g1', player, mockDb)).toBe(false)
  })
  it('Jol-Nar — true when >= 8 techs', async () => {
    const player = { id: 'p1', technologies: Array(8).fill('x') }
    expect(await checkCommanderUnlock('The Universities Of Jol-Nar', 'g1', player, mockDb)).toBe(true)
  })
  it('Yin — false when used_indoctrination not set', async () => {
    const player = { id: 'p1', commander_flags: {} }
    expect(await checkCommanderUnlock('The Yin Brotherhood', 'g1', player, mockDb)).toBe(false)
  })
  it('Yin — true when commander_flags.used_indoctrination=true', async () => {
    const player = { id: 'p1', commander_flags: { used_indoctrination: true } }
    expect(await checkCommanderUnlock('The Yin Brotherhood', 'g1', player, mockDb)).toBe(true)
  })
  it('unknown faction — returns false', async () => {
    expect(await checkCommanderUnlock('Unknown Faction', 'g1', {}, mockDb)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-unlock-commander.test.js
```

Expected: FAIL — file doesn't exist yet.

- [ ] **Step 3: Create `commanderUnlock.ts`**

```typescript
// supabase/functions/_shared/commanderUnlock.ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function checkCommanderUnlock(
  faction: string,
  gameId: string,
  player: Record<string, unknown>,
  db: SupabaseClient
): Promise<boolean> {
  const technologies = (player.technologies as string[]) ?? []
  const tradeGoods = (player.trade_goods as number) ?? 0
  const actionCardCount = (player.action_card_count as number) ?? 0
  const commanderFlags = (player.commander_flags as Record<string, unknown>) ?? {}

  switch (faction) {
    case 'The Nekro Virus':
      return technologies.length >= 3

    case 'The Embers Of Muaat': {
      const { data } = await db.from('game_player_units').select('count').eq('game_id', gameId)
        .eq('player_id', player.id as string).eq('unit_type', 'war_sun').limit(1)
      return (data?.length ?? 0) > 0
    }

    case 'The L1Z1X Mindnet': {
      const { data } = await db.from('game_player_units').select('count').eq('game_id', gameId)
        .eq('player_id', player.id as string).eq('unit_type', 'dreadnought')
      const total = (data ?? []).reduce((sum: number, r: { count: number }) => sum + r.count, 0)
      return total >= 4
    }

    case 'The Mahact Gene-Sorcerers': {
      const { data } = await db.from('game_system_activations').select('token_owner_id')
        .eq('game_id', gameId).eq('player_id', player.id as string)
        .neq('token_owner_id', player.id as string)
      const distinct = new Set((data ?? []).map((r: { token_owner_id: string }) => r.token_owner_id))
      return distinct.size >= 2
    }

    case 'The Argent Flight': {
      const capableTypes = ['destroyer', 'cruiser', 'pds', 'war_sun', 'flagship', 'dreadnought']
      const { data } = await db.from('game_player_units').select('count').eq('game_id', gameId)
        .eq('player_id', player.id as string).in('unit_type', capableTypes)
      const total = (data ?? []).reduce((sum: number, r: { count: number }) => sum + r.count, 0)
      return total >= 6
    }

    case 'The Titans Of Ul': {
      const { count: dockCount } = await db.from('game_player_planets').select('*', { count: 'exact' })
        .eq('game_id', gameId).eq('player_id', player.id as string).not('space_dock_unit_id', 'is', null)
      // PDS count: sum pds_count across planets (approximate via unit table)
      const { data: pdsData } = await db.from('game_player_units').select('count')
        .eq('game_id', gameId).eq('player_id', player.id as string).eq('unit_type', 'pds')
      const pdsTotal = (pdsData ?? []).reduce((sum: number, r: { count: number }) => sum + r.count, 0)
      return ((dockCount ?? 0) + pdsTotal) >= 5
    }

    case 'The Vuil\'raith Cabal': {
      const { data: riftData } = await db.from('game_player_units').select('system_key')
        .eq('game_id', gameId).eq('player_id', player.id as string)
      const { data: tiles } = await db.from('tiles').select('id,gravity_rift').eq('gravity_rift', true)
      const { data: game } = await db.from('games').select('map_tiles').eq('id', gameId).single()
      const riftTileIds = new Set((tiles ?? []).map((t: { id: string }) => t.id))
      const mapTiles = (game?.map_tiles ?? {}) as Record<string, string>
      const riftSystemKeys = new Set(
        Object.entries(mapTiles).filter(([, tileId]) => riftTileIds.has(tileId)).map(([key]) => key)
      )
      const playerSystems = new Set((riftData ?? []).map((r: { system_key: string }) => r.system_key))
      let count = 0
      for (const key of playerSystems) { if (riftSystemKeys.has(key)) count++ }
      return count >= 3
    }

    case 'The Naaz-Rokha Alliance': {
      const { data } = await db.from('game_player_units').select('system_key')
        .eq('game_id', gameId).eq('player_id', player.id as string).eq('unit_type', 'mech')
      const distinct = new Set((data ?? []).map((r: { system_key: string }) => r.system_key))
      return distinct.size >= 3
    }

    case 'The Federation Of Sol': {
      const { data: planets } = await db.from('game_player_planets').select('planet_name')
        .eq('game_id', gameId).eq('player_id', player.id as string)
      if (!planets || planets.length === 0) return false
      const planetNames = planets.map((p: { planet_name: string }) => p.planet_name)
      const { data: tilePlanets } = await db.from('planets').select('name,resources').in('name', planetNames)
      const total = (tilePlanets ?? []).reduce((sum: number, p: { resources: number }) => sum + (p.resources ?? 0), 0)
      return total >= 12
    }

    case 'The Clan Of Saar': {
      const { count } = await db.from('game_player_planets').select('*', { count: 'exact' })
        .eq('game_id', gameId).eq('player_id', player.id as string).not('space_dock_unit_id', 'is', null)
      return (count ?? 0) >= 3
    }

    case 'The Barony Of Letnev': {
      const { data } = await db.from('game_player_units').select('system_key,count')
        .eq('game_id', gameId).eq('player_id', player.id as string)
        .not('unit_type', 'in', '("fighter","infantry","mech")')
      const bySystem: Record<string, number> = {}
      for (const r of (data ?? []) as Array<{ system_key: string; count: number }>) {
        bySystem[r.system_key] = (bySystem[r.system_key] ?? 0) + r.count
      }
      const maxInSystem = Math.max(0, ...Object.values(bySystem))
      return maxInSystem >= 5
    }

    case 'The Universities Of Jol-Nar':
      return technologies.length >= 8

    case 'The Yin Brotherhood':
      return commanderFlags.used_indoctrination === true

    case 'The Emirates Of Hacan':
      return tradeGoods >= 10

    case 'The Winnu': {
      const { data: mecatol } = await db.from('game_player_planets').select('planet_name')
        .eq('game_id', gameId).eq('player_id', player.id as string).eq('planet_name', 'Mecatol Rex').limit(1)
      return (mecatol?.length ?? 0) > 0 || commanderFlags.entered_mecatol_combat === true
    }

    case 'The Nomad': {
      const { count } = await db.from('game_player_secret_objectives').select('*', { count: 'exact' })
        .eq('game_id', gameId).eq('player_id', player.id as string).eq('state', 'scored')
      return (count ?? 0) >= 1
    }

    case 'The Yssaril Tribes':
      return actionCardCount >= 7

    case 'The Arborec': {
      const { data } = await db.from('game_player_units').select('count')
        .eq('game_id', gameId).eq('player_id', player.id as string)
        .in('unit_type', ['infantry', 'mech']).not('on_planet', 'is', null)
      const total = (data ?? []).reduce((sum: number, r: { count: number }) => sum + r.count, 0)
      return total >= 12
    }

    case 'The Naalu Collective': {
      const { data } = await db.from('game_player_units').select('count')
        .eq('game_id', gameId).eq('player_id', player.id as string).eq('unit_type', 'fighter')
      const total = (data ?? []).reduce((sum: number, r: { count: number }) => sum + r.count, 0)
      return total >= 12
    }

    case 'The Xxcha Kingdom': {
      const { data: planets } = await db.from('game_player_planets').select('planet_name')
        .eq('game_id', gameId).eq('player_id', player.id as string)
      if (!planets || planets.length === 0) return false
      const planetNames = planets.map((p: { planet_name: string }) => p.planet_name)
      const { data: tilePlanets } = await db.from('planets').select('name,influence').in('name', planetNames)
      const total = (tilePlanets ?? []).reduce((sum: number, p: { influence: number }) => sum + (p.influence ?? 0), 0)
      return total >= 12
    }

    case 'The Mentak Coalition': {
      const { data } = await db.from('game_player_units').select('count')
        .eq('game_id', gameId).eq('player_id', player.id as string).eq('unit_type', 'cruiser')
      const total = (data ?? []).reduce((sum: number, r: { count: number }) => sum + r.count, 0)
      return total >= 4
    }

    case 'The Empyrean': {
      const { data: playerSysData } = await db.from('game_player_units').select('system_key')
        .eq('game_id', gameId).eq('player_id', player.id as string)
      const playerSystems = new Set((playerSysData ?? []).map((r: { system_key: string }) => r.system_key))
      const { data: otherPlayers } = await db.from('game_players').select('id')
        .eq('game_id', gameId).neq('id', player.id as string)
      for (const other of (otherPlayers ?? []) as Array<{ id: string }>) {
        const { data: otherSysData } = await db.from('game_player_units').select('system_key')
          .eq('game_id', gameId).eq('player_id', other.id)
        const otherSystems = new Set((otherSysData ?? []).map((r: { system_key: string }) => r.system_key))
        // Simplified adjacency check — full adjacency requires map data; approximate by shared border
        const shares = [...otherSystems].some(s => playerSystems.has(s))
        if (!shares) return false
      }
      return true
    }

    case 'Sardakk N\'orr': {
      const { data: homeTile } = await db.from('tiles').select('id').eq('home_faction', "Sardakk N'orr").single()
      const { data: nonHome } = await db.from('game_player_planets').select('planet_name')
        .eq('game_id', gameId).eq('player_id', player.id as string)
      if (!homeTile || !nonHome) return false
      // Approximate: count all controlled planets (full home-tile exclusion requires join)
      return nonHome.length >= 5
    }

    case 'The Ghosts Of Creuss': {
      const { data } = await db.from('game_player_units').select('system_key')
        .eq('game_id', gameId).eq('player_id', player.id as string)
      const playerSystems = [...new Set((data ?? []).map((r: { system_key: string }) => r.system_key))]
      const { data: wormholeSystems } = await db.from('game_system_state').select('system_key')
        .eq('game_id', gameId).contains('wormholes', ['alpha'])
      const wormholeSet = new Set((wormholeSystems ?? []).map((r: { system_key: string }) => r.system_key))
      const count = playerSystems.filter(s => wormholeSet.has(s)).length
      return count >= 3
    }

    default:
      return false
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-unlock-commander.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/commanderUnlock.ts tests/functions/game-unlock-commander.test.js
git commit -m "feat(leaders): add commanderUnlock.ts with all 24 faction unlock conditions"
```

---

### Task 2: `game-unlock-commander` — new Edge Function

**Files:**
- Create: `supabase/functions/game-unlock-commander/index.ts`

Read spec `fn-game-unlock-commander.md`.

- [ ] **Step 1: Write failing tests**

```javascript
// tests/functions/game-unlock-commander.test.js — extend with integration tests:

describe('game-unlock-commander', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await invoke({ game_id: 'g1', leader_id: 'l1' }, { noAuth: true })
    expect(res.status).toBe(401)
  })

  it('returns 400 when game_id missing', async () => {
    const res = await invoke({ leader_id: 'l1' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when leader_id missing', async () => {
    const res = await invoke({ game_id: 'g1' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when leader not found', async () => {
    mockLeaderRow(null)
    const res = await invoke({ game_id: 'g1', leader_id: 'nonexistent' })
    expect(res.status).toBe(404)
  })

  it('returns 400 when leader is not a commander', async () => {
    mockLeaderRow({ id: 'l1', faction: 'The Nekro Virus', leader_type: 'agent' })
    const res = await invoke({ game_id: 'g1', leader_id: 'l1' })
    expect(res.status).toBe(400)
  })

  it('returns 409 when commander already unlocked', async () => {
    mockLeaderRow({ id: 'l1', faction: 'The Nekro Virus', leader_type: 'commander' })
    mockPlayer({ leaders: { commander: 'unlocked' } })
    const res = await invoke({ game_id: 'g1', leader_id: 'l1' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'Commander already unlocked' })
  })

  it('returns 409 when unlock condition not met', async () => {
    mockLeaderRow({ id: 'l1', faction: 'The Nekro Virus', leader_type: 'commander' })
    mockPlayer({ leaders: { commander: 'locked' }, technologies: ['tech1'] })
    const res = await invoke({ game_id: 'g1', leader_id: 'l1' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'Unlock condition not met' })
  })

  it('returns 200 and sets leaders.commander to unlocked when condition met', async () => {
    mockLeaderRow({ id: 'l1', faction: 'The Nekro Virus', leader_type: 'commander' })
    mockPlayer({ leaders: { commander: 'locked' }, technologies: ['t1', 't2', 't3'] })
    const res = await invoke({ game_id: 'g1', leader_id: 'l1' })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ leaders: expect.objectContaining({ commander: 'unlocked' }) }))
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-unlock-commander.test.js -t "game-unlock-commander"
```

Expected: FAIL.

- [ ] **Step 3: Create `game-unlock-commander/index.ts`**

```typescript
// supabase/functions/game-unlock-commander/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import { createError, errorResponse } from '../_shared/errors.ts'
import { checkCommanderUnlock } from '../_shared/commanderUnlock.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const user = await getAuthenticatedUser(req, db)
    const body = await req.json()

    const { game_id, leader_id } = body
    if (!game_id) throw createError(400, 'game_id is required')
    if (!leader_id) throw createError(400, 'leader_id is required')

    const { data: player } = await db.from('game_players').select(
      'id,leaders,technologies,trade_goods,action_card_count,commander_flags,faction'
    ).eq('game_id', game_id).eq('user_id', user.id).single()
    if (!player) throw createError(404, 'Player not found in this game')

    const { data: leaderRow } = await db.from('leaders').select('faction,leader_type').eq('id', leader_id).single()
    if (!leaderRow) throw createError(404, 'Leader not found')
    if (leaderRow.leader_type !== 'commander') throw createError(400, 'Leader is not a commander')

    const leaders = (player.leaders ?? {}) as Record<string, string>
    if (leaders.commander === 'unlocked') throw createError(409, 'Commander already unlocked')

    const met = await checkCommanderUnlock(leaderRow.faction, game_id, player, db)
    if (!met) throw createError(409, 'Unlock condition not met')

    await db.from('game_players')
      .update({ leaders: { ...leaders, commander: 'unlocked' } })
      .eq('id', player.id)

    return new Response(JSON.stringify({ unlocked: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return errorResponse(err)
  }
})
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-unlock-commander.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-unlock-commander/index.ts
git commit -m "feat(leaders): add game-unlock-commander Edge Function"
```

---

### Task 3: Populate `COMMANDER_PASSIVES` and implement `applyCommanderPassives`

**Files:**
- Modify: `supabase/functions/_shared/leaderEffects.ts`

Read spec `shared-leaderEffects-p43c.md` for all 24 commander passive definitions. Read the current `leaderEffects.ts` to find `COMMANDER_PASSIVES` and `applyCommanderPassives`.

- [ ] **Step 1: Replace the empty `COMMANDER_PASSIVES` with all 24 entries (from spec)**

Copy the full registry from `shared-leaderEffects-p43c.md` into `leaderEffects.ts`.

- [ ] **Step 2: Implement `applyCommanderPassives`**

```typescript
export async function applyCommanderPassives(
  trigger: CommanderTrigger,
  context: Record<string, unknown> & { gameId: string; faction?: string },
  db: SupabaseClient
): Promise<{ inlineEffects: unknown[]; pendingWindows: unknown[] }> {
  const { data: players } = await db.from('game_players')
    .select('id,faction,leaders').eq('game_id', context.gameId)

  const inlineEffects: unknown[] = []
  const pendingWindows: unknown[] = []

  for (const player of (players ?? []) as Array<{ id: string; faction: string; leaders?: Record<string, string> }>) {
    if (player.leaders?.commander !== 'unlocked') continue
    const passives = COMMANDER_PASSIVES[player.faction] ?? []
    for (const passive of passives) {
      if (passive.trigger !== trigger) continue
      if (passive.mode === 'inline') {
        // Apply effect immediately
        if (typeof passive.effect === 'string') {
          const { getHandler } = await import('./abilityHandlers.ts')
          const passiveContext = { ...context, activatingPlayerId: player.id, faction: player.faction }
          await getHandler(passive.effect)(passiveContext, db)
          inlineEffects.push({ faction: player.faction, effect: passive.effect })
        } else {
          const { interpretEffects } = await import('./abilityDsl.ts')
          await interpretEffects(passive.effect, { ...context, playerId: player.id }, db)
          inlineEffects.push({ faction: player.faction, effect: passive.effect })
        }
      } else {
        // Emit pending window for player decision
        pendingWindows.push({
          type: 'commander_passive',
          player_id: player.id,
          faction: player.faction,
          trigger,
          effect: passive.effect,
          context: { trigger, system_key: context.systemKey, ...context },
        })
      }
    }
  }

  return { inlineEffects, pendingWindows }
}
```

- [ ] **Step 3: Run tests**

```bash
cd ti4-companion-web && npm test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/leaderEffects.ts
git commit -m "feat(leaders): populate COMMANDER_PASSIVES and implement applyCommanderPassives"
```

---

### Task 4: Register commander passive handlers in `abilityHandlers.ts`

**Files:**
- Modify: `supabase/functions/_shared/abilityHandlers.ts`

Read spec `shared-abilityHandlers-p43c.md`. Add the handler entries after existing hero handlers.

- [ ] **Step 1: Add all commander passive handlers**

```typescript
// Commander passive handlers (context-mutation pattern — callers read context after these run)
mahact_il_na_viroset: async (context, db) => {
  const systemKey = context.systemKey as string
  await db.from('game_system_activations')
    .update({ returned_to_reinforcements: true })
    .eq('game_id', context.gameId as string).eq('system_key', systemKey)
    .eq('player_id', context.activatingPlayerId as string)
},

l1z1x_skip_planetary_shield: async (context, _db) => {
  ;(context as Record<string, unknown>).skipPlanetaryShield = true
},

xxcha_extra_vote_per_planet: async (context, _db) => {
  const exhaustedCount = ((context.selections as Record<string, number>)?.exhausted_planet_count ?? 0)
  ;(context as Record<string, unknown>).extraVotes = ((context.extraVotes as number) ?? 0) + exhaustedCount
},

winnu_combat_bonus: async (context, db) => {
  const systemKey = context.systemKey as string
  const { data: game } = await db.from('games').select('map_tiles').eq('id', context.gameId as string).single()
  const mapTiles = (game?.map_tiles ?? {}) as Record<string, string>
  const tileId = mapTiles[systemKey]
  if (!tileId) return
  const { data: tile } = await db.from('tiles').select('id,planets').eq('id', tileId).single()
  const isLegendary = (tile?.planets as Array<{ legendary?: boolean }> ?? []).some(p => p.legendary)
  const isMecatol = systemKey === '0,0'
  if (isMecatol || isLegendary) {
    ;(context as Record<string, unknown>).combatRollBonus = ((context.combatRollBonus as number) ?? 0) + 2
  }
},

hacan_trade_good_votes: async (context, db) => {
  const tgSpent = ((context.selections as Record<string, number>)?.trade_goods_spent ?? 0)
  if (tgSpent <= 0) return
  const { data: player } = await db.from('game_players').select('trade_goods').eq('id', context.playerId as string).single()
  if (!player || player.trade_goods < tgSpent) throw { status: 409, message: 'Insufficient trade goods' }
  await db.from('game_players').update({ trade_goods: player.trade_goods - tgSpent }).eq('id', context.playerId as string)
  ;(context as Record<string, unknown>).extraVotes = ((context.extraVotes as number) ?? 0) + tgSpent * 2
},

yin_omar_passive: async (context, _db) => {
  ;(context as Record<string, unknown>).ignoreOnePrerequisite = true
  ;(context as Record<string, unknown>).extraInfantryFree = 1
},

jol_nar_reroll_window: async (context, _db) => {
  const windows = ((context.pendingWindows as unknown[]) ?? [])
  windows.push({
    type: 'commander_reroll',
    player_id: context.activatingPlayerId,
    dice: context.currentDiceResults,
    combat_id: context.combatId,
    faction: 'The Universities Of Jol-Nar',
  })
  ;(context as Record<string, unknown>).pendingWindows = windows
},

yssaril_peek_window: async (context, _db) => {
  const windows = ((context.pendingWindows as unknown[]) ?? [])
  windows.push({
    type: 'commander_passive',
    player_id: context.yssarilPlayerId,
    faction: 'The Yssaril Tribes',
    trigger: 'SYSTEM_ACTIVATED',
    activating_player_id: context.activatingPlayerId,
  })
  ;(context as Record<string, unknown>).pendingWindows = windows
},

empyrean_return_token: async (context, db) => {
  const tokenSystem = context.systemKey as string
  await db.from('game_system_activations')
    .delete()
    .eq('game_id', context.gameId as string)
    .eq('system_key', tokenSystem)
    .eq('player_id', context.empyreanPlayerId as string)
  const { data: p } = await db.from('game_players').select('command_tokens').eq('id', context.empyreanPlayerId as string).single()
  if (p) {
    const tokens = p.command_tokens as Record<string, number>
    await db.from('game_players').update({ command_tokens: { ...tokens, tactic_total: (tokens.tactic_total ?? 0) + 1 } }).eq('id', context.empyreanPlayerId as string)
  }
},

sardakk_extended_commitment: async (context, _db) => {
  ;(context as Record<string, unknown>).sardakkExtendedCommit = true
},

naalu_extra_fighter: async (context, _db) => {
  ;(context as Record<string, unknown>).extraFightersFreeOfLimit = ((context.extraFightersFreeOfLimit as number) ?? 0) + 1
},

nomad_free_flagship: async (context, _db) => {
  ;(context as Record<string, unknown>).flagshipCostOverride = 0
},

vuil_production_limit_bypass: async (context, _db) => {
  ;(context as Record<string, unknown>).freeFromLimitCount = ((context.freeFromLimitCount as number) ?? 0) + 2
},
```

- [ ] **Step 2: Run tests**

```bash
cd ti4-companion-web && npm test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/abilityHandlers.ts
git commit -m "feat(leaders): register commander passive handlers in abilityHandlers"
```

---

### Task 5: Wire `applyCommanderPassives` into 14 Edge Functions

**Files:** (all Modify)
`game-produce-units`, `game-research-technology`, `game-assign-hits`, `game-commit-ground-forces`, `game-roll-combat-dice`, `game-roll-ground-combat-dice`, `game-fire-bombardment`, `game-fire-space-cannon`, `game-fire-anti-fighter-barrage`, `game-activate-system`, `game-move-ships`, `game-play-strategy-card`, `game-cast-votes`

Read the corresponding spec files (`fn-game-produce-units-p43c.md`, etc.) for trigger type and context shape. The pattern is identical for all functions — read the current file to find the right insertion point near the end.

- [ ] **Step 1: Write tests for the two most important functions**

```javascript
// tests/functions/game-produce-units.test.js — add:
describe('commander passives on PRODUCTION', () => {
  it('applies inline passive for Titans (gain 1 TG on production) when Titans commander unlocked', async () => {
    mockOtherPlayer({ faction: 'The Titans Of Ul', leaders: { commander: 'unlocked' } })
    await invokeProduceUnits({ unit_type: 'carrier', count: 1, system_key: '1,0' })
    expect(mockTitansPlayerUpdate).toHaveBeenCalledWith(expect.objectContaining({ trade_goods: expect.any(Number) }))
  })
  it('emits commander_passive pending_window for window-mode passives', async () => {
    mockOtherPlayer({ faction: 'The Argent Flight', leaders: { commander: 'unlocked' } })
    const res = await invokeProduceUnits({ unit_type: 'carrier', count: 1, system_key: '1,0' })
    const body = await res.json()
    expect(body.pending_window?.type).toBe('commander_passive')
  })
})

// tests/functions/game-fire-bombardment.test.js — add:
describe('L1Z1X commander passive on BOMBARDMENT', () => {
  it('sets skipPlanetaryShield in context when L1Z1X commander unlocked', async () => {
    mockPlayer({ faction: 'The L1Z1X Mindnet', leaders: { commander: 'unlocked' } })
    const res = await invokeBombardment({ system_key: '1,0' })
    expect(res.status).toBe(200)
    // Verify planetary shield was skipped — e.g., no 409 despite planet having PDS
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-produce-units.test.js -t "commander passives"
```

- [ ] **Step 3: Add the hook to each function**

In each function, import and call `applyCommanderPassives` near the end of the handler (before the final response). The pattern:

```typescript
import { applyCommanderPassives } from '../_shared/leaderEffects.ts'

// Near the end of the handler, before okResponse:
const { inlineEffects, pendingWindows } = await applyCommanderPassives(
  'PRODUCTION',  // use the correct trigger for this function
  { gameId, playerId: player.id, systemKey, ...relevantContext },
  db
)

// Merge pendingWindows into response (append to any existing pending windows):
const allPendingWindows = [...(existingPendingWindows ?? []), ...pendingWindows]
return okResponse({ ...result, pending_window: allPendingWindows[0] ?? undefined })
```

Trigger mapping by function:
- `game-produce-units` → `'PRODUCTION'`
- `game-research-technology` → `'TECH_RESEARCHED'`
- `game-assign-hits` → `'SUSTAIN_DAMAGE'` (only when sustain_damage occurred)
- `game-commit-ground-forces` → `'GROUND_COMBAT_START'`
- `game-roll-combat-dice` → `'COMBAT_ROLL'`
- `game-roll-ground-combat-dice` → `'COMBAT_ROLL'`
- `game-fire-bombardment` → `'BOMBARDMENT'`
- `game-fire-space-cannon` → `'UNIT_ABILITY_ROLL'`
- `game-fire-anti-fighter-barrage` → `'UNIT_ABILITY_ROLL'`
- `game-activate-system` → `'SYSTEM_ACTIVATED'` (append to existing reactive-agent windows from 43a)
- `game-move-ships` → `'SHIPS_MOVED'`
- `game-play-strategy-card` → `'STRATEGY_TOKEN_SPENT'`
- `game-cast-votes` → `'CAST_VOTES'`

- [ ] **Step 4: Run full test suite**

```bash
cd ti4-companion-web && npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-produce-units/index.ts supabase/functions/game-research-technology/index.ts supabase/functions/game-assign-hits/index.ts supabase/functions/game-commit-ground-forces/index.ts supabase/functions/game-roll-combat-dice/index.ts supabase/functions/game-roll-ground-combat-dice/index.ts supabase/functions/game-fire-bombardment/index.ts supabase/functions/game-fire-space-cannon/index.ts supabase/functions/game-fire-anti-fighter-barrage/index.ts supabase/functions/game-activate-system/index.ts supabase/functions/game-move-ships/index.ts supabase/functions/game-play-strategy-card/index.ts supabase/functions/game-cast-votes/index.ts
git commit -m "feat(leaders): wire applyCommanderPassives into 13 Edge Functions (Phase 43c)"
```

---

### Task 6: `game-resolve-commander-reroll` — Jol-Nar dice reroll function

**Files:**
- Create: `supabase/functions/game-resolve-commander-reroll/index.ts`

Read spec `fn-game-resolve-commander-reroll.md`.

- [ ] **Step 1: Write failing tests**

```javascript
// tests/functions/game-resolve-commander-reroll.test.js
describe('game-resolve-commander-reroll', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await invoke({ game_id: 'g1', combat_id: 'c1', reroll_indices: [0] }, { noAuth: true })
    expect(res.status).toBe(401)
  })
  it('returns 400 when required fields missing', async () => {
    expect((await invoke({ game_id: 'g1', combat_id: 'c1' })).status).toBe(400)
    expect((await invoke({ game_id: 'g1', reroll_indices: [0] })).status).toBe(400)
    expect((await invoke({ combat_id: 'c1', reroll_indices: [0] })).status).toBe(400)
  })
  it('returns 409 when commander not unlocked', async () => {
    mockPlayer({ faction: 'The Universities Of Jol-Nar', leaders: { commander: 'locked' } })
    const res = await invoke({ game_id: 'g1', combat_id: 'c1', reroll_indices: [0] })
    expect(res.status).toBe(409)
  })
  it('returns 400 when faction is not Jol-Nar', async () => {
    mockPlayer({ faction: 'The Nekro Virus', leaders: { commander: 'unlocked' } })
    const res = await invoke({ game_id: 'g1', combat_id: 'c1', reroll_indices: [0] })
    expect(res.status).toBe(400)
  })
  it('returns 400 when reroll index out of range', async () => {
    mockPlayer({ faction: 'The Universities Of Jol-Nar', leaders: { commander: 'unlocked' } })
    mockCombat({ attacker_player_id: 'p1', attacker_dice: [{ roll: 5, hit_on: 7, hit: false }] })
    const res = await invoke({ game_id: 'g1', combat_id: 'c1', reroll_indices: [5] })
    expect(res.status).toBe(400)
  })
  it('returns 200, rerolls chosen dice, updates combat row', async () => {
    mockPlayer({ faction: 'The Universities Of Jol-Nar', leaders: { commander: 'unlocked' } })
    mockCombat({
      attacker_player_id: 'p1',
      attacker_dice: [{ roll: 3, hit_on: 7, hit: false }, { roll: 8, hit_on: 7, hit: true }]
    })
    vi.spyOn(Math, 'random').mockReturnValue(0.9) // roll = 10
    const res = await invoke({ game_id: 'g1', combat_id: 'c1', reroll_indices: [0] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dice[0].roll).toBe(10)
    expect(body.dice[0].rerolled).toBe(true)
    expect(body.dice[1].roll).toBe(8) // unchanged
    expect(body.hits).toBe(2) // both dice now hit
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-commander-reroll.test.js
```

- [ ] **Step 3: Create the function**

```typescript
// supabase/functions/game-resolve-commander-reroll/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import { createError, errorResponse } from '../_shared/errors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const user = await getAuthenticatedUser(req, db)
    const { game_id, combat_id, reroll_indices } = await req.json()

    if (!game_id) throw createError(400, 'game_id is required')
    if (!combat_id) throw createError(400, 'combat_id is required')
    if (!reroll_indices || !Array.isArray(reroll_indices) || reroll_indices.length === 0) {
      throw createError(400, 'reroll_indices must be a non-empty array')
    }

    const { data: player } = await db.from('game_players').select('id,faction,leaders')
      .eq('game_id', game_id).eq('user_id', user.id).single()
    if (!player) throw createError(404, 'Player not found')

    const leaders = (player.leaders ?? {}) as Record<string, string>
    if (leaders.commander !== 'unlocked') throw createError(409, 'Commander not unlocked')
    if (player.faction !== 'The Universities Of Jol-Nar') throw createError(400, 'Only Jol-Nar can use this endpoint')

    const { data: combat } = await db.from('game_combats').select('*').eq('id', combat_id).single()
    if (!combat) throw createError(404, 'Combat not found')

    const side = combat.attacker_player_id === player.id ? 'attacker' : 'defender'
    const diceCol = side === 'attacker' ? 'attacker_dice' : 'defender_dice'
    const hitsCol = side === 'attacker' ? 'attacker_hits' : 'defender_hits'
    const currentDice = combat[diceCol] as Array<{ roll: number; hit_on: number; hit: boolean; rerolled?: boolean }>

    if ((reroll_indices as number[]).some((i: number) => i >= currentDice.length)) {
      throw createError(400, 'Invalid reroll indices')
    }

    const newDice = currentDice.map((die, i) =>
      (reroll_indices as number[]).includes(i)
        ? { ...die, roll: Math.floor(Math.random() * 10) + 1, rerolled: true }
        : die
    ).map(d => ({ ...d, hit: d.roll >= d.hit_on }))

    const newHits = newDice.filter(d => d.hit).length

    await db.from('game_combats')
      .update({ [diceCol]: newDice, [hitsCol]: newHits })
      .eq('id', combat_id)

    return new Response(JSON.stringify({ dice: newDice, hits: newHits }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return errorResponse(err)
  }
})
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/functions/game-resolve-commander-reroll.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/game-resolve-commander-reroll/index.ts tests/functions/game-resolve-commander-reroll.test.js
git commit -m "feat(leaders): add game-resolve-commander-reroll Edge Function (Jol-Nar Ta Zern)"
```

---

### Task 7: `edgeFunctions.js` — add `unlockCommander` and `resolveCommanderReroll` wrappers

**Files:**
- Modify: `src/lib/edgeFunctions.js`

Read spec `client-edgeFunctions-p43c.md`. Read the current file to find `callFunction` usage.

- [ ] **Step 1: Write failing tests**

```javascript
// tests/lib/edgeFunctions.test.js — add:
it('unlockCommander calls game-unlock-commander with correct body', async () => {
  mockCallFunction.mockResolvedValue({ unlocked: true })
  await unlockCommander('game1', 'leader1')
  expect(mockCallFunction).toHaveBeenCalledWith('game-unlock-commander', { game_id: 'game1', leader_id: 'leader1' })
})

it('resolveCommanderReroll calls game-resolve-commander-reroll with correct body', async () => {
  mockCallFunction.mockResolvedValue({ dice: [], hits: 0 })
  await resolveCommanderReroll('game1', 'combat1', [0, 2])
  expect(mockCallFunction).toHaveBeenCalledWith('game-resolve-commander-reroll', {
    game_id: 'game1', combat_id: 'combat1', reroll_indices: [0, 2]
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ti4-companion-web && npx vitest run tests/lib/edgeFunctions.test.js -t "unlockCommander\|resolveCommanderReroll"
```

- [ ] **Step 3: Add exports to `edgeFunctions.js`** (read file first)

```javascript
export const unlockCommander = (gameId, leaderId) =>
  callFunction('game-unlock-commander', { game_id: gameId, leader_id: leaderId })

export const resolveCommanderReroll = (gameId, combatId, rerollIndices) =>
  callFunction('game-resolve-commander-reroll', { game_id: gameId, combat_id: combatId, reroll_indices: rerollIndices })
```

- [ ] **Step 4: Run tests**

```bash
cd ti4-companion-web && npx vitest run tests/lib/edgeFunctions.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/edgeFunctions.js tests/lib/edgeFunctions.test.js
git commit -m "feat(client): add unlockCommander and resolveCommanderReroll edge function wrappers"
```

---

### Task 8: `CommanderRerollModal` component + `useLeaders` + `GameScreen` wiring

**Files:**
- Create: `src/components/game/CommanderRerollModal.jsx`
- Modify: `src/hooks/useLeaders.js`
- Modify: `src/components/game/GameScreen.jsx`

Read specs `component-CommanderRerollModal.md`, `hook-useLeaders-p43c.md`, `component-GameScreen-p43c.md`.

- [ ] **Step 1: Write failing hook tests**

```javascript
// tests/hooks/useLeaders.test.js — add:
it('unlockCommander calls edge function with leader id', async () => {
  const mockUnlock = vi.fn().mockResolvedValue({ unlocked: true })
  vi.mock('../../src/lib/edgeFunctions', () => ({ unlockCommander: mockUnlock }))
  const { result } = renderHook(() => useLeaders(mockGame, mockPlayer))
  await act(() => result.current.unlockCommander('leader1'))
  expect(mockUnlock).toHaveBeenCalledWith(mockGame.id, 'leader1')
})

it('handleCommanderRerollConfirm calls resolveCommanderReroll and closes modal', async () => {
  const mockReroll = vi.fn().mockResolvedValue({ dice: [], hits: 0 })
  vi.mock('../../src/lib/edgeFunctions', () => ({ resolveCommanderReroll: mockReroll }))
  const { result } = renderHook(() => useLeaders(mockGame, mockPlayer))
  act(() => result.current.handleCommanderPassiveWindow({ type: 'commander_reroll', combat_id: 'c1', dice: [] }))
  await act(() => result.current.handleCommanderRerollConfirm([0]))
  expect(mockReroll).toHaveBeenCalledWith(mockGame.id, 'c1', [0])
  expect(result.current.commanderRerollModalOpen).toBe(false)
})

it('handleCommanderPassiveWindow opens reroll modal for commander_reroll type', () => {
  const { result } = renderHook(() => useLeaders(mockGame, mockPlayer))
  act(() => result.current.handleCommanderPassiveWindow({ type: 'commander_reroll', combat_id: 'c1', dice: [{ roll: 5, hit_on: 7, hit: false }] }))
  expect(result.current.commanderRerollModalOpen).toBe(true)
  expect(result.current.commanderRerollWindow).toMatchObject({ combat_id: 'c1' })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ti4-companion-web && npx vitest run tests/hooks/useLeaders.test.js -t "reroll\|unlockCommander"
```

- [ ] **Step 3: Create `CommanderRerollModal.jsx`**

```jsx
// src/components/game/CommanderRerollModal.jsx
import { useState } from 'react'

export default function CommanderRerollModal({ window: rerollWindow, onConfirm, onClose }) {
  const [selected, setSelected] = useState([])

  const toggle = (i) => {
    setSelected(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
    )
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50">
      <div className="panel w-full max-w-md p-6 space-y-4">
        <div>
          <p className="label">Jol-Nar Commander — Ta Zern</p>
          <p className="text-sm text-muted mt-1">
            After you roll dice for a unit ability, you may reroll any of those dice.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(rerollWindow?.dice ?? []).map((die, i) => (
            <button
              key={i}
              className={`p-3 rounded border text-sm text-center transition-colors ${
                selected.includes(i) ? 'border-plasma text-bright bg-plasma/10' : 'border-border text-muted'
              } ${die.rerolled ? 'opacity-50' : ''}`}
              onClick={() => !die.rerolled && toggle(i)}
              disabled={die.rerolled}
            >
              <div className="text-lg font-mono">{die.roll}</div>
              <div className="text-xs">{die.hit ? '✓ Hit' : '✗ Miss'}</div>
              {die.rerolled && <div className="text-xs text-muted">(rerolled)</div>}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted">{selected.length} dice selected for reroll</p>

        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            disabled={selected.length === 0}
            onClick={() => onConfirm(selected)}
          >
            REROLL
          </button>
          <button className="btn-ghost" onClick={onClose}>
            KEEP ALL
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add to `useLeaders.js`** (read file first)

```javascript
const [commanderRerollModalOpen, setCommanderRerollModalOpen] = useState(false)
const [commanderRerollWindow, setCommanderRerollWindow] = useState(null)

const unlockCommander = useCallback(async (leaderId) => {
  await unlockCommanderFn(game.id, leaderId)
  // Optimistically update or refetch leaders
}, [game.id])

const handleCommanderPassiveWindow = useCallback((window) => {
  if (window.type === 'commander_reroll') {
    setCommanderRerollWindow(window)
    setCommanderRerollModalOpen(true)
  }
  // commander_passive type falls through to existing action window banner queue
}, [])

const handleCommanderRerollConfirm = useCallback(async (rerollIndices) => {
  if (!commanderRerollWindow) return
  await resolveCommanderRerollFn(game.id, commanderRerollWindow.combat_id, rerollIndices)
  setCommanderRerollModalOpen(false)
  setCommanderRerollWindow(null)
}, [game.id, commanderRerollWindow])

// Add to return value:
// unlockCommander, handleCommanderPassiveWindow, commanderRerollModalOpen,
// commanderRerollWindow, handleCommanderRerollConfirm
```

- [ ] **Step 5: Update `GameScreen.jsx`** (read file first) — extend the `pending_window` switch:

```javascript
case 'commander_passive':
  handleCommanderPassiveWindow(window)
  break
case 'commander_reroll':
  handleCommanderPassiveWindow(window)
  break
```

And render `CommanderRerollModal` when `commanderRerollModalOpen` is true, passing the reroll handler from `useLeaders`.

- [ ] **Step 6: Update `LeaderPanel.jsx`** (read file first) — pass `onUnlockCommander={unlockCommander}` down to `LeaderCard` so the CHECK UNLOCK button can call it.

- [ ] **Step 7: Run tests**

```bash
cd ti4-companion-web && npm test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/game/CommanderRerollModal.jsx src/hooks/useLeaders.js src/components/game/GameScreen.jsx src/components/game/LeaderPanel.jsx tests/hooks/useLeaders.test.js
git commit -m "feat(ui): add CommanderRerollModal and wire commander unlock + reroll to GameScreen"
```

---

### Task 9: Deploy all new/modified Edge Functions and smoke test

- [ ] **Step 1: Deploy**

```bash
supabase functions deploy game-unlock-commander --no-verify-jwt
supabase functions deploy game-resolve-commander-reroll --no-verify-jwt
supabase functions deploy game-produce-units --no-verify-jwt
supabase functions deploy game-research-technology --no-verify-jwt
supabase functions deploy game-assign-hits --no-verify-jwt
supabase functions deploy game-commit-ground-forces --no-verify-jwt
supabase functions deploy game-roll-combat-dice --no-verify-jwt
supabase functions deploy game-roll-ground-combat-dice --no-verify-jwt
supabase functions deploy game-fire-bombardment --no-verify-jwt
supabase functions deploy game-fire-space-cannon --no-verify-jwt
supabase functions deploy game-fire-anti-fighter-barrage --no-verify-jwt
supabase functions deploy game-activate-system --no-verify-jwt
supabase functions deploy game-move-ships --no-verify-jwt
supabase functions deploy game-play-strategy-card --no-verify-jwt
supabase functions deploy game-cast-votes --no-verify-jwt
```

- [ ] **Step 2: Run full test suite**

```bash
cd ti4-companion-web && npm test
```

Expected: all pass.

- [ ] **Step 3: Manual smoke test — key paths**

- Play as Jol-Nar: roll combat dice → `commander_reroll` window appears → reroll modal opens → select 2 dice → REROLL button → dice re-rolled, hits updated
- Play as Nekro: trigger a TECH_RESEARCHED event → `commander_passive` window appears for Nekro player → they draw 1 action card
- CHECK UNLOCK button on commander card calls the endpoint → 409 if condition not met, unlocks if met

- [ ] **Step 4: Update `_index.md` Phase 43c entries to `done`**

Change status for all 22 Phase 43c spec entries in `_index.md`.

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/docs/superpowers/plans/main_plan/_index.md
git commit -m "docs: mark Phase 43c Commander Passives as done in _index.md"
```
