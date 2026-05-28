import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  unlockCommander: vi.fn().mockResolvedValue({}),
  resolveAbility: vi.fn().mockResolvedValue({}),
  deployMech: vi.fn().mockResolvedValue({}),
  resolveMechAbility: vi.fn().mockResolvedValue({}),
  resolveCommanderReroll: vi.fn().mockResolvedValue({}),
}))

import { supabase } from '../../src/lib/supabase.js'
import { unlockCommander, resolveAbility, deployMech, resolveMechAbility, resolveCommanderReroll } from '../../src/lib/edgeFunctions.js'
import { useLeaders } from '../../src/hooks/useLeaders.js'

const AGENT = { id: 'l1', leader_type: 'agent', faction: 'Arborec', leader_name: 'Trr\'n' }
const COMMANDER = { id: 'l2', leader_type: 'commander', faction: 'Arborec', leader_name: 'Letani Mirik' }
const HERO = { id: 'l3', leader_type: 'hero', faction: 'Arborec', leader_name: 'Rin' }
const MECH = { id: 'u1', unit_type: 'mech', faction: 'Arborec', unit_name: 'Letani Warrior II' }

function mockSupabaseTables({ leaders = [AGENT, COMMANDER, HERO], mechs = [MECH] } = {}) {
  let callCount = 0
  supabase.from.mockImplementation((table) => {
    if (table === 'leaders') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: leaders }),
        }),
      }
    }
    if (table === 'units') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mechs }),
          }),
        }),
      }
    }
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [] }) }) }
  })
}

describe('useLeaders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null leaders when currentPlayer has no faction', () => {
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: null }, gameId: 'g1' })
    )
    expect(result.current.agent).toBeNull()
    expect(result.current.commander).toBeNull()
    expect(result.current.hero).toBeNull()
    expect(result.current.factionMech).toBeNull()
  })

  it('fetches agent, commander, hero, and mech for faction', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    await waitFor(() => expect(result.current.agent).not.toBeNull())
    expect(result.current.agent).toMatchObject({ id: 'l1', leader_type: 'agent' })
    expect(result.current.commander).toMatchObject({ id: 'l2', leader_type: 'commander' })
    expect(result.current.hero).toMatchObject({ id: 'l3', leader_type: 'hero' })
    expect(result.current.factionMech).toMatchObject({ id: 'u1', unit_type: 'mech' })
  })

  it('exposes leaderStatus from currentPlayer.leaders', () => {
    const leaders = { agent: 'exhausted', commander: 'unlocked', hero: 'purged' }
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: null, leaders }, gameId: 'g1' })
    )
    expect(result.current.leaderStatus).toEqual(leaders)
  })

  it('defaults leaderStatus when currentPlayer.leaders is null', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    expect(result.current.leaderStatus).toEqual({ agent: 'unlocked', commander: 'locked', hero: 'locked' })
  })

  it('unlockCommander calls unlockCommander with gameId and leaderId', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    await act(async () => {
      await result.current.unlockCommander('ability-123')
    })
    expect(unlockCommander).toHaveBeenCalledWith('g1', 'ability-123')
  })

  it('unlockHero calls resolveAbility with unlock=true', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    await act(async () => {
      await result.current.unlockHero('l3')
    })
    expect(resolveAbility).toHaveBeenCalledWith('g1', null, 'leader', 'l3', { unlock: true })
  })

  it('resolveLeaderAbility calls resolveAbility with correct arguments', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    await act(async () => {
      await result.current.resolveLeaderAbility('ab-42', 'l1', { target: 'p2' })
    })
    expect(resolveAbility).toHaveBeenCalledWith('g1', 'ab-42', 'leader', 'l1', { target: 'p2' })
  })

  it('deployMech calls deployMech with gameId prepended', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    await act(async () => {
      await result.current.deployMech('u1', '0,1', 'Mecatol Rex', false)
    })
    expect(deployMech).toHaveBeenCalledWith('g1', 'u1', '0,1', 'Mecatol Rex', false)
  })

  it('resolveMechAbility calls resolveMechAbility with gameId prepended', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    await act(async () => {
      await result.current.resolveMechAbility('u1', { target: 'system-1' })
    })
    expect(resolveMechAbility).toHaveBeenCalledWith('g1', 'u1', { target: 'system-1' })
  })

  it('handleUseAbility opens modal with the given leader set as activeLeader', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    act(() => {
      result.current.handleUseAbility({ id: 'l1', abilityDefinitionId: 'ab-1' })
    })
    expect(result.current.leaderModalOpen).toBe(true)
    expect(result.current.activeLeader).toMatchObject({ id: 'l1', abilityDefinitionId: 'ab-1' })
  })

  it('handleConfirm calls resolveAbility with correct args and closes modal', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    act(() => {
      result.current.handleUseAbility({ id: 'l1', abilityDefinitionId: 'ab-42' })
    })
    act(() => {
      result.current.handleConfirm({ target: 'p2' })
    })
    expect(result.current.leaderModalOpen).toBe(false)
    expect(resolveAbility).toHaveBeenCalledWith('g1', 'ab-42', 'leader', 'l1', { target: 'p2' })
  })

  it('handleReactiveAgentWindow opens modal when current player is eligible', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', id: 'p1', leaders: null }, gameId: 'g1' })
    )
    await waitFor(() => expect(result.current.agent).not.toBeNull())
    act(() => {
      result.current.handleReactiveAgentWindow({
        eligible: [{ player_id: 'p1' }],
        context: { trigger: 'something' },
      })
    })
    expect(result.current.leaderModalOpen).toBe(true)
    expect(result.current.activeLeader).toMatchObject({ isReactive: true })
  })

  it('handleReactiveAgentWindow does nothing when current player is not eligible', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', id: 'p1', leaders: null }, gameId: 'g1' })
    )
    act(() => {
      result.current.handleReactiveAgentWindow({
        eligible: [{ player_id: 'p2' }],
        context: {},
      })
    })
    expect(result.current.leaderModalOpen).toBe(false)
  })

  it('unlockCommander calls unlockCommander edge function with gameId and leaderId', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    await act(async () => {
      await result.current.unlockCommander('leader-123')
    })
    expect(unlockCommander).toHaveBeenCalledWith('g1', 'leader-123')
  })

  it('handleCommanderRerollConfirm calls resolveCommanderReroll and closes modal', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    act(() => {
      result.current.handleCommanderPassiveWindow({ type: 'commander_reroll', combat_id: 'c1' })
    })
    expect(result.current.commanderRerollModalOpen).toBe(true)
    act(() => {
      result.current.handleCommanderRerollConfirm([0, 2])
    })
    expect(resolveCommanderReroll).toHaveBeenCalledWith('g1', 'c1', [0, 2])
    expect(result.current.commanderRerollModalOpen).toBe(false)
  })

  it('handleCommanderPassiveWindow opens reroll modal for commander_reroll type', async () => {
    mockSupabaseTables()
    const { result } = renderHook(() =>
      useLeaders({ currentPlayer: { faction: 'Arborec', leaders: null }, gameId: 'g1' })
    )
    act(() => {
      result.current.handleCommanderPassiveWindow({ type: 'commander_reroll', combat_id: 'c1' })
    })
    expect(result.current.commanderRerollModalOpen).toBe(true)
    expect(result.current.commanderRerollWindow).toMatchObject({ type: 'commander_reroll', combat_id: 'c1' })
  })
})
