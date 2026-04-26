# Task 10: Modify useGalaxy — Add activeCombat

**Files:**
- Modify: `src/hooks/useGalaxy.js`
- Create: `tests/hooks/useGalaxy.phase10.test.js`

**Context:** After the initial data load, also fetch the active `game_combats` row (status = 'active') for this game. Add a Realtime subscription on `game_combats` (filtered by `game_id`) so `activeCombat` stays live. This gives `GalaxyTab` enough to know which combat modal to render without needing a second hook call just for phase detection.

---

- [ ] **Step 1: Write the failing tests**

Create `tests/hooks/useGalaxy.phase10.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const { mockChannel } = vi.hoisted(() => {
  const mockChannel = { on: vi.fn(), subscribe: vi.fn() }
  mockChannel.on.mockReturnValue(mockChannel)
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
  activateSystem: vi.fn(),
  landTroops: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { useGalaxy } from '../../src/hooks/useGalaxy.js'

const GAME = {
  id: 'game-uuid', code: 'ABC123', round: 1,
  map_tiles: { '1,-1': { tile_id: 'tile-a' } },
}

const COMBAT = {
  id: 'combat-uuid', game_id: 'game-uuid', system_key: '1,-1',
  attacker_player_id: 'p1', defender_player_id: 'p2',
  phase: 'attacker_roll', round: 1, status: 'active',
  attacker_hits: 0, defender_hits: 0,
}

function mockSupabase(activeCombat = COMBAT) {
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
    if (table === 'tiles') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_system_activations') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
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
    if (table === 'game_player_units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'game_players') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
            }),
          }),
        }),
      }
    }
    if (table === 'game_combats') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: activeCombat, error: null }),
            }),
          }),
        }),
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockChannel.on.mockReturnValue(mockChannel)
  mockChannel.subscribe.mockReturnValue(mockChannel)
  mockSupabase()
})

describe('useGalaxy — activeCombat (Phase 10)', () => {
  it('exposes activeCombat after load when a combat is active', async () => {
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeCombat).not.toBeNull()
    expect(result.current.activeCombat.phase).toBe('attacker_roll')
  })

  it('exposes activeCombat as null when no active combat', async () => {
    mockSupabase(null)
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeCombat).toBeNull()
  })

  it('updates activeCombat on Realtime INSERT for game_combats', async () => {
    mockSupabase(null)
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Find the game_combats channel handler
    const combatCall = mockChannel.on.mock.calls.find((c) => c[1]?.table === 'game_combats')
    const combatHandler = combatCall?.[2]

    act(() => {
      combatHandler({ eventType: 'INSERT', new: COMBAT })
    })

    expect(result.current.activeCombat).toEqual(COMBAT)
  })

  it('clears activeCombat when combat status becomes complete', async () => {
    const { result } = renderHook(() => useGalaxy('ABC123', 'user-uuid'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeCombat).not.toBeNull()

    const combatCall = mockChannel.on.mock.calls.find((c) => c[1]?.table === 'game_combats')
    const combatHandler = combatCall?.[2]

    act(() => {
      combatHandler({ eventType: 'UPDATE', new: { ...COMBAT, status: 'complete' } })
    })

    expect(result.current.activeCombat).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/hooks/useGalaxy.phase10.test.js
```

Expected: FAIL — `activeCombat` is undefined on the hook result.

- [ ] **Step 3: Modify `src/hooks/useGalaxy.js`**

Add `activeCombat` state and fetch + Realtime subscription inside the existing `load()` function. Full updated file:

```js
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { activateSystem as activateSystemFn, landTroops as landTroopsFn } from '../lib/edgeFunctions.js'

export function useGalaxy(gameCode, userId) {
  const [gameId, setGameId] = useState(null)
  const [mapTiles, setMapTiles] = useState({})
  const [tileData, setTileData] = useState({})
  const [activations, setActivations] = useState([])
  const [allPlanets, setAllPlanets] = useState([])
  const [systemUnits, setSystemUnits] = useState([])
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [activeCombat, setActiveCombat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const gameIdRef = useRef(null)
  const roundRef = useRef(1)

  useEffect(() => {
    if (!gameCode || !userId) return
    let mounted = true
    let channel = null

    async function load() {
      setLoading(true)
      setError(null)

      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('id, map_tiles, round')
        .eq('code', gameCode.toUpperCase())
        .maybeSingle()

      if (!mounted) return
      if (gameError || !game) { setError('Failed to load game'); setLoading(false); return }

      gameIdRef.current = game.id
      roundRef.current = game.round
      setGameId(game.id)
      setMapTiles(game.map_tiles ?? {})

      const tileIds = Object.values(game.map_tiles ?? {}).map(t => t.tile_id)
      if (tileIds.length > 0) {
        const { data: tiles } = await supabase
          .from('tiles')
          .select('id, tile_number, planets, type, wormhole')
          .in('id', tileIds)
        if (!mounted) return
        const indexed = {}
        for (const tile of tiles ?? []) indexed[tile.id] = tile
        setTileData(indexed)
      }

      const { data: acts } = await supabase
        .from('game_system_activations')
        .select('*')
        .eq('game_id', game.id)
        .eq('round', game.round)
      if (!mounted) return
      setActivations(acts ?? [])

      const { data: planets } = await supabase
        .from('game_player_planets')
        .select('*')
        .eq('game_id', game.id)
      if (!mounted) return
      setAllPlanets(planets ?? [])

      const { data: units } = await supabase
        .from('game_player_units')
        .select('*')
        .eq('game_id', game.id)
      if (!mounted) return
      setSystemUnits(units ?? [])

      const { data: myPlayer } = await supabase
        .from('game_players')
        .select('id')
        .eq('game_id', game.id)
        .eq('user_id', userId)
        .maybeSingle()
      if (!mounted) return
      setMyPlayerId(myPlayer?.id ?? null)

      // Fetch active combat for this game
      const { data: combat } = await supabase
        .from('game_combats')
        .select('*')
        .eq('game_id', game.id)
        .eq('status', 'active')
        .maybeSingle()
      if (!mounted) return
      setActiveCombat(combat ?? null)

      setLoading(false)

      channel = supabase
        .channel(`galaxy:${game.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
          async (payload) => {
            if (!mounted) return
            if (payload.new.map_tiles) setMapTiles(payload.new.map_tiles)
            if (payload.new.round && payload.new.round !== roundRef.current) {
              roundRef.current = payload.new.round
              const { data } = await supabase
                .from('game_system_activations')
                .select('*')
                .eq('game_id', gameIdRef.current)
                .eq('round', payload.new.round)
              if (mounted && data) setActivations(data)
            }
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_system_activations', filter: `game_id=eq.${game.id}` },
          async () => {
            if (!mounted) return
            const { data } = await supabase
              .from('game_system_activations')
              .select('*')
              .eq('game_id', gameIdRef.current)
              .eq('round', roundRef.current)
            if (mounted && data) setActivations(data)
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_player_planets', filter: `game_id=eq.${game.id}` },
          (payload) => {
            if (!mounted) return
            setAllPlanets(prev => {
              if (payload.eventType === 'INSERT') return [...prev, payload.new]
              if (payload.eventType === 'UPDATE') return prev.map(p => p.id === payload.new.id ? payload.new : p)
              if (payload.eventType === 'DELETE') return prev.filter(p => p.id !== payload.old.id)
              return prev
            })
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_player_units', filter: `game_id=eq.${game.id}` },
          (payload) => {
            if (!mounted) return
            setSystemUnits(prev => {
              if (payload.eventType === 'INSERT') return [...prev, payload.new]
              if (payload.eventType === 'UPDATE') return prev.map(u => u.id === payload.new.id ? payload.new : u)
              if (payload.eventType === 'DELETE') return prev.filter(u => u.id !== payload.old.id)
              return prev
            })
          }
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_combats', filter: `game_id=eq.${game.id}` },
          (payload) => {
            if (!mounted) return
            if (payload.eventType === 'INSERT') {
              setActiveCombat(payload.new)
            } else if (payload.eventType === 'UPDATE') {
              setActiveCombat(payload.new.status === 'complete' ? null : payload.new)
            } else if (payload.eventType === 'DELETE') {
              setActiveCombat(null)
            }
          }
        )
        .subscribe()
    }

    load()

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameCode, userId])

  const activatedSystems = new Set(activations.map(a => a.system_key))
  const myActivations = new Set(
    activations.filter(a => a.player_id === myPlayerId).map(a => a.system_key)
  )
  const planetOwnership = new Map(
    allPlanets.map(p => [p.planet_name, { player_id: p.player_id, exhausted: p.exhausted }])
  )

  return {
    gameId,
    mapTiles,
    tileData,
    activations,
    allPlanets,
    systemUnits,
    activatedSystems,
    myActivations,
    planetOwnership,
    activeCombat,
    myPlayerId,
    loading,
    error,
    activateSystem: (systemKey) => activateSystemFn(gameId, systemKey),
    landTroops: (systemKey, planetName, troopCount) => landTroopsFn(gameId, systemKey, planetName, troopCount),
  }
}
```

- [ ] **Step 4: Run all useGalaxy tests to verify they pass**

```bash
npx vitest run tests/hooks/useGalaxy.test.js tests/hooks/useGalaxy.phase10.test.js
```

Expected: all existing tests pass + 4 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGalaxy.js tests/hooks/useGalaxy.phase10.test.js
git commit -m "feat: add activeCombat state and Realtime subscription to useGalaxy"
```
