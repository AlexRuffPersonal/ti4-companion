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
}))

import { supabase } from '../../src/lib/supabase.js'
import { unlockCommander, resolveAbility } from '../../src/lib/edgeFunctions.js'
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

  it('unlockCommander calls unlockCommander with gameId and abilityId', async () => {
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
})
