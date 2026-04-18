import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAbilities } from '../../src/hooks/useAbilities.js'

const PLAYER_SOURCES = {
  playerId: 'p1',
  factionName: 'The Mentak Coalition',
  actionCardIds: ['card-uuid-1'],
  leaderIds: [],
  relicIds: [],
  promissoryNoteIds: [],
  technologyIds: ['tech-1', 'tech-2', 'tech-3'],
  explorationCardIds: [],
  scoredObjectivesCount: 3,
  vp: 5,
}

const FACTION_ABILITY = {
  id: 'ab-1',
  ability_name: 'Pillage',
  trigger: { event: 'TRADE_GOODS_GAINED', owner: 'other' },
  unlock_conditions: null,
  ability_sources: [{ source_type: 'faction_ability', faction_name: 'The Mentak Coalition' }],
}

const ACTION_CARD_ABILITY = {
  id: 'ab-2',
  ability_name: 'Ancient Burial Sites',
  trigger: { event: 'AGENDA_PHASE_START', owner: 'self' },
  unlock_conditions: null,
  ability_sources: [{ source_type: 'action_card', source_id: 'card-uuid-1' }],
}

const COMMANDER_UNLOCK_ABILITY = {
  id: 'ab-3',
  ability_name: 'Il Na Viroset unlock',
  trigger: { event: 'PASSIVE' },
  unlock_conditions: [{ check: 'scored_objectives', gte: 3 }],
  ability_sources: [{ source_type: 'leader', source_id: 'leader-uuid-1' }],
}

const ALL_ABILITIES = [FACTION_ABILITY, ACTION_CARD_ABILITY, COMMANDER_UNLOCK_ABILITY]

describe('useAbilities', () => {
  it('returns empty triggerable when currentEvent is null', () => {
    const { result } = renderHook(() => useAbilities(null, PLAYER_SOURCES, ALL_ABILITIES))
    expect(result.current.triggerable).toHaveLength(0)
  })

  it('returns faction ability when event matches and player has that faction', () => {
    const event = { type: 'TRADE_GOODS_GAINED', gameId: 'g1', triggeredByPlayerId: 'p2' }
    const { result } = renderHook(() => useAbilities(event, PLAYER_SOURCES, ALL_ABILITIES))
    expect(result.current.triggerable).toContainEqual(expect.objectContaining({ id: 'ab-1' }))
  })

  it('returns action card ability when event matches and player holds the card', () => {
    const event = { type: 'AGENDA_PHASE_START', gameId: 'g1', triggeredByPlayerId: null }
    const { result } = renderHook(() => useAbilities(event, PLAYER_SOURCES, ALL_ABILITIES))
    expect(result.current.triggerable).toContainEqual(expect.objectContaining({ id: 'ab-2' }))
  })

  it('does not return ability when player does not hold the source card', () => {
    const sources = { ...PLAYER_SOURCES, actionCardIds: [] }
    const event = { type: 'AGENDA_PHASE_START', gameId: 'g1', triggeredByPlayerId: null }
    const { result } = renderHook(() => useAbilities(event, sources, ALL_ABILITIES))
    expect(result.current.triggerable.map(a => a.id)).not.toContain('ab-2')
  })

  it('does not return faction ability when event owner is self but triggeredByPlayerId is another player', () => {
    const selfAbility = { ...FACTION_ABILITY, trigger: { event: 'TRADE_GOODS_GAINED', owner: 'self' } }
    const event = { type: 'TRADE_GOODS_GAINED', gameId: 'g1', triggeredByPlayerId: 'p2' }
    const { result } = renderHook(() => useAbilities(event, PLAYER_SOURCES, [selfAbility]))
    expect(result.current.triggerable).toHaveLength(0)
  })

  it('returns commander in unlockable when unlock_conditions are met', () => {
    const sources = { ...PLAYER_SOURCES, lockedCommanderAbilityIds: ['ab-3'] }
    const { result } = renderHook(() => useAbilities(null, sources, ALL_ABILITIES))
    expect(result.current.unlockable).toContainEqual(expect.objectContaining({ id: 'ab-3' }))
  })

  it('does not return commander in unlockable when conditions are not met', () => {
    const sources = { ...PLAYER_SOURCES, lockedCommanderAbilityIds: ['ab-3'], scoredObjectivesCount: 2 }
    const { result } = renderHook(() => useAbilities(null, sources, ALL_ABILITIES))
    expect(result.current.unlockable).toHaveLength(0)
  })

  it('returns empty arrays when allAbilityDefinitions is empty', () => {
    const event = { type: 'AGENDA_PHASE_START', gameId: 'g1', triggeredByPlayerId: null }
    const { result } = renderHook(() => useAbilities(event, PLAYER_SOURCES, []))
    expect(result.current.triggerable).toHaveLength(0)
    expect(result.current.unlockable).toHaveLength(0)
  })
})
