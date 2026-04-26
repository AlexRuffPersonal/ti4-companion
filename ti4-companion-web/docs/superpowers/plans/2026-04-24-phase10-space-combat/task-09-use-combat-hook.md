# Task 09: useCombat Hook

**Files:**
- Create: `src/hooks/useCombat.js`
- Create: `tests/hooks/useCombat.test.js`

**Context:** Subscribes to the specific `game_combats` row identified by `combatId`. Returns `combat` state (the full row, or `null` if no combatId) and four dispatchers that call the matching edge functions with `gameId` pre-bound. When `combatId` changes, tears down the old subscription and sets up a new one.

---

- [ ] **Step 1: Write the failing tests**

Create `tests/hooks/useCombat.test.js`:

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
  fireSpaceCannon: vi.fn(),
  rollCombatDice: vi.fn(),
  assignHits: vi.fn(),
  declareRetreat: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase.js'
import { fireSpaceCannon, rollCombatDice, assignHits, declareRetreat } from '../../src/lib/edgeFunctions.js'
import { useCombat } from '../../src/hooks/useCombat.js'

const GAME_ID = 'game-uuid'
const COMBAT_ID = 'combat-uuid'

const COMBAT_ROW = {
  id: COMBAT_ID,
  game_id: GAME_ID,
  system_key: '1,-1',
  attacker_player_id: 'p1',
  defender_player_id: 'p2',
  phase: 'attacker_roll',
  round: 1,
  status: 'active',
  attacker_hits: 0,
  defender_hits: 0,
  attacker_dice: null,
  defender_dice: null,
  space_cannon_pending: [],
  retreat_declared_by: null,
  retreat_destination: null,
}

function mockSupabase(combat = COMBAT_ROW) {
  supabase.from.mockImplementation((table) => {
    if (table === 'game_combats') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: combat, error: null }),
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

describe('useCombat', () => {
  it('returns null combat when combatId is null', async () => {
    const { result } = renderHook(() => useCombat(GAME_ID, null))
    await waitFor(() => expect(result.current.combat).toBeNull())
  })

  it('fetches combat row on mount when combatId provided', async () => {
    const { result } = renderHook(() => useCombat(GAME_ID, COMBAT_ID))
    await waitFor(() => expect(result.current.combat).not.toBeNull())
    expect(result.current.combat.phase).toBe('attacker_roll')
  })

  it('subscribes to Realtime on mount and unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => useCombat(GAME_ID, COMBAT_ID))
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled())
    unmount()
    expect(supabase.removeChannel).toHaveBeenCalled()
  })

  it('updates combat state on Realtime UPDATE event', async () => {
    const { result } = renderHook(() => useCombat(GAME_ID, COMBAT_ID))
    await waitFor(() => expect(result.current.combat).not.toBeNull())

    const realtimeHandler = mockChannel.on.mock.calls[0][2]
    act(() => {
      realtimeHandler({ eventType: 'UPDATE', new: { ...COMBAT_ROW, phase: 'defender_assign', attacker_hits: 2 } })
    })

    expect(result.current.combat.phase).toBe('defender_assign')
    expect(result.current.combat.attacker_hits).toBe(2)
  })

  it('fireSpaceCannon dispatcher calls edgeFunctions.fireSpaceCannon with bound ids', async () => {
    fireSpaceCannon.mockResolvedValue({ phase: 'barrage' })
    const { result } = renderHook(() => useCombat(GAME_ID, COMBAT_ID))
    await waitFor(() => expect(result.current.combat).not.toBeNull())

    await act(() => result.current.fireSpaceCannon(false))
    expect(fireSpaceCannon).toHaveBeenCalledWith(GAME_ID, COMBAT_ID, false)
  })

  it('rollDice dispatcher calls edgeFunctions.rollCombatDice with bound ids', async () => {
    rollCombatDice.mockResolvedValue({ phase: 'defender_assign' })
    const { result } = renderHook(() => useCombat(GAME_ID, COMBAT_ID))
    await waitFor(() => expect(result.current.combat).not.toBeNull())

    await act(() => result.current.rollDice())
    expect(rollCombatDice).toHaveBeenCalledWith(GAME_ID, COMBAT_ID)
  })

  it('assignHits dispatcher calls edgeFunctions.assignHits with bound ids', async () => {
    assignHits.mockResolvedValue({ status: 'active' })
    const { result } = renderHook(() => useCombat(GAME_ID, COMBAT_ID))
    await waitFor(() => expect(result.current.combat).not.toBeNull())

    const casualties = [{ unit_type: 'fighter', player_unit_id: 'u1', action: 'destroy' }]
    await act(() => result.current.assignHits(casualties))
    expect(assignHits).toHaveBeenCalledWith(GAME_ID, COMBAT_ID, casualties)
  })

  it('declareRetreat dispatcher calls edgeFunctions.declareRetreat with bound ids', async () => {
    declareRetreat.mockResolvedValue({ retreat_destination: '2,-1' })
    const { result } = renderHook(() => useCombat(GAME_ID, COMBAT_ID))
    await waitFor(() => expect(result.current.combat).not.toBeNull())

    await act(() => result.current.declareRetreat('2,-1'))
    expect(declareRetreat).toHaveBeenCalledWith(GAME_ID, COMBAT_ID, '2,-1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/hooks/useCombat.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/hooks/useCombat.js`**

```js
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  fireSpaceCannon as fireSpaceCannonFn,
  rollCombatDice as rollCombatDiceFn,
  assignHits as assignHitsFn,
  declareRetreat as declareRetreatFn,
} from '../lib/edgeFunctions.js'

export function useCombat(gameId, combatId) {
  const [combat, setCombat] = useState(null)
  const gameIdRef = useRef(gameId)
  const combatIdRef = useRef(combatId)

  useEffect(() => {
    gameIdRef.current = gameId
    combatIdRef.current = combatId
  })

  useEffect(() => {
    if (!gameId || !combatId) {
      setCombat(null)
      return
    }
    let mounted = true
    let channel = null

    async function load() {
      const { data } = await supabase
        .from('game_combats')
        .select('*')
        .eq('id', combatId)
        .maybeSingle()
      if (mounted && data) setCombat(data)

      channel = supabase
        .channel(`combat:${combatId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_combats', filter: `id=eq.${combatId}` },
          (payload) => {
            if (!mounted) return
            if (payload.eventType === 'UPDATE') setCombat(payload.new)
            if (payload.eventType === 'DELETE') setCombat(null)
          }
        )
        .subscribe()
    }

    load()

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [gameId, combatId])

  return {
    combat,
    fireSpaceCannon: (pass) => fireSpaceCannonFn(gameId, combatId, pass),
    rollDice: () => rollCombatDiceFn(gameId, combatId),
    assignHits: (casualties) => assignHitsFn(gameId, combatId, casualties),
    declareRetreat: (destination) => declareRetreatFn(gameId, combatId, destination),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/hooks/useCombat.test.js
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCombat.js tests/hooks/useCombat.test.js
git commit -m "feat: add useCombat hook with Realtime subscription and dispatchers"
```
