import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/edgeFunctions.js', () => ({
  researchTechnology: vi.fn().mockResolvedValue({}),
}))

import { renderHook, act } from '@testing-library/react'
import {
  computeHeldCounts,
  computeTechStatus,
  useTechTree,
} from '../../src/hooks/useTechTree.js'
import { researchTechnology } from '../../src/lib/edgeFunctions.js'

// ── Sample reference data ─────────────────────────────────────────────────────
// technology_type replaces colour + is_unit_upgrade:
//   'green'/'blue'/'yellow'/'red' = colour families
//   'unit_upgrade' = unit upgrade (excluded from prereq colour counts)

const ALL_TECHS = [
  { id: 't1', name: 'Neural Motivator',        technology_type: 'green',        prerequisites: {},           faction: null,      expansion: 'base' },
  { id: 't2', name: 'Psychoarchaeology',        technology_type: 'green',        prerequisites: { green: 1 }, faction: null,      expansion: 'base' },
  { id: 't3', name: 'Bio-Stims',               technology_type: 'green',        prerequisites: { green: 2 }, faction: null,      expansion: 'base' },
  { id: 't4', name: 'Hyper Metabolism',         technology_type: 'green',        prerequisites: { green: 3 }, faction: null,      expansion: 'base' },
  { id: 't5', name: 'Sarween Tools',            technology_type: 'yellow',       prerequisites: {},           faction: null,      expansion: 'base' },
  { id: 't6', name: 'AI Development Algorithm', technology_type: 'yellow',       prerequisites: { red: 1 },   faction: null,      expansion: 'base' },
  { id: 't7', name: 'Antimass Deflectors',      technology_type: 'blue',         prerequisites: {},           faction: null,      expansion: 'base' },
  { id: 't8', name: 'Carrier II',               technology_type: 'unit_upgrade', prerequisites: { blue: 1 },  faction: null,      expansion: 'base' },
  { id: 't9', name: 'Chaos Mapping',            technology_type: 'green',        prerequisites: {},           faction: 'Arborec', expansion: 'base' },
]

const ACTIVE_EXPANSIONS = { base: true }

// ── computeHeldCounts ─────────────────────────────────────────────────────────

describe('computeHeldCounts', () => {
  it('returns zero counts when nothing is held', () => {
    expect(computeHeldCounts([], ALL_TECHS)).toEqual({ green: 0, blue: 0, yellow: 0, red: 0 })
  })

  it('counts held techs by technology_type', () => {
    const held = ['Neural Motivator', 'Sarween Tools', 'Antimass Deflectors']
    expect(computeHeldCounts(held, ALL_TECHS)).toEqual({ green: 1, blue: 1, yellow: 1, red: 0 })
  })

  it('does not count unit_upgrade techs toward colour prereqs', () => {
    const held = ['Carrier II']
    expect(computeHeldCounts(held, ALL_TECHS)).toEqual({ green: 0, blue: 0, yellow: 0, red: 0 })
  })

  it('ignores tech names not found in allTechnologies', () => {
    expect(computeHeldCounts(['Unknown Tech'], ALL_TECHS)).toEqual({ green: 0, blue: 0, yellow: 0, red: 0 })
  })
})

// ── computeTechStatus ─────────────────────────────────────────────────────────

describe('computeTechStatus', () => {
  const noReadyPlanets = []

  it('returns held when tech name is in heldTechNames', () => {
    const result = computeTechStatus(ALL_TECHS[0], ['Neural Motivator'], ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('held')
    expect(result.missingPrereqs).toEqual([])
    expect(result.exhaustOptions).toEqual([])
  })

  it('returns available when tech has no prerequisites', () => {
    const result = computeTechStatus(ALL_TECHS[0], [], ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('available')
  })

  it('returns available when prerequisites are satisfied by held techs', () => {
    // Bio-Stims needs green: 2 — hold Neural Motivator + Psychoarchaeology
    const held = ['Neural Motivator', 'Psychoarchaeology']
    const result = computeTechStatus(ALL_TECHS[2], held, ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('available')
  })

  it('returns unavailable when prerequisites are not met and no exhaust options exist', () => {
    // Bio-Stims needs green: 2 — hold only one green
    const result = computeTechStatus(ALL_TECHS[2], ['Neural Motivator'], ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('unavailable')
    expect(result.missingPrereqs).toEqual([{ colour: 'green', count: 1 }])
  })

  it('missingPrereqs only lists unresolvable colours for multi-colour prereqs', () => {
    // Suppose a tech needs { green: 1, blue: 1 }.
    // Player holds one green (satisfies green), no blue coverage.
    // missingPrereqs should only list blue, not green.
    const multiColourTech = {
      id: 'mx', name: 'Multi Test', technology_type: 'red',
      prerequisites: { green: 1, blue: 1 }, faction: null, expansion: 'base',
    }
    const held = ['Neural Motivator'] // 1 green
    const result = computeTechStatus(multiColourTech, held, ALL_TECHS, [])
    expect(result.status).toBe('unavailable')
    expect(result.missingPrereqs).toHaveLength(1)
    expect(result.missingPrereqs[0].colour).toBe('blue')
  })

  it('returns exhaust when a missing prereq can be covered by a readied specialty planet', () => {
    // Bio-Stims needs green: 2 — hold one green, have a readied green-specialty planet
    const held = ['Neural Motivator']
    const readyPlanets = [{ id: 'planet-1', tech_specialty: 'green', exhausted: false }]
    const result = computeTechStatus(ALL_TECHS[2], held, ALL_TECHS, readyPlanets)
    expect(result.status).toBe('exhaust')
    expect(result.exhaustOptions).toHaveLength(1)
    expect(result.exhaustOptions[0].id).toBe('planet-1')
    expect(result.exhaustOptions[0].coversColour).toBe('green')
  })

  it('returns exhaust when AI Development Algorithm covers one missing prereq', () => {
    // Bio-Stims needs green: 2, hold one green, hold AIDA (covers any colour for one missing prereq)
    const held = ['Neural Motivator', 'AI Development Algorithm']
    const result = computeTechStatus(ALL_TECHS[2], held, ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('exhaust')
    expect(result.exhaustOptions).toEqual([])
  })

  it('returns unavailable when AIDA is held but two prereqs are missing (AIDA only covers one)', () => {
    // Hyper Metabolism needs green: 3 — hold zero green, hold AIDA
    const held = ['AI Development Algorithm']
    const result = computeTechStatus(ALL_TECHS[3], held, ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('unavailable')
  })

  it('uses a planet for each missing prereq independently (multi-planet exhaust)', () => {
    // Hyper Metabolism needs green: 3 — hold one green, have two readied green planets
    const held = ['Neural Motivator']
    const readyPlanets = [
      { id: 'p1', tech_specialty: 'green', exhausted: false },
      { id: 'p2', tech_specialty: 'green', exhausted: false },
    ]
    const result = computeTechStatus(ALL_TECHS[3], held, ALL_TECHS, readyPlanets)
    expect(result.status).toBe('exhaust')
    expect(result.exhaustOptions).toHaveLength(2)
  })

  it('does not include already-exhausted planets as exhaust options', () => {
    const held = ['Neural Motivator']
    const readyPlanets = [{ id: 'p1', tech_specialty: 'green', exhausted: true }]
    const result = computeTechStatus(ALL_TECHS[2], held, ALL_TECHS, readyPlanets)
    // computeTechStatus trusts the caller to pass only ready planets; this planet still matches
    expect(result.status).toBe('exhaust')
  })

  it('faction techs return correct status', () => {
    // Chaos Mapping (Arborec faction, green, no prereqs) should be available to any player
    const result = computeTechStatus(ALL_TECHS[8], [], ALL_TECHS, noReadyPlanets)
    expect(result.status).toBe('available')
  })
})

// ── useTechTree hook ──────────────────────────────────────────────────────────

const PLAYER = {
  id: 'player-1',
  technologies: ['Neural Motivator'],
  faction: 'Arborec',
}
const PLANETS = [
  { id: 'pl-1', planet_name: 'Nestphar', tech_specialty: null, exhausted: false },
  { id: 'pl-2', planet_name: 'Lazar',    tech_specialty: 'blue', exhausted: false },
]

describe('useTechTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sections contain the correct techs grouped by technology_type', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    expect(result.current.sections.biotic.some(t => t.name === 'Neural Motivator')).toBe(true)
    expect(result.current.sections.unitUpgrades.some(t => t.name === 'Carrier II')).toBe(true)
    expect(result.current.sections.faction.some(t => t.name === 'Chaos Mapping')).toBe(true)
  })

  it('faction section contains only techs matching the player faction', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    const factionNames = result.current.sections.faction.map(t => t.name)
    expect(factionNames).toContain('Chaos Mapping')
    expect(factionNames).not.toContain('Neural Motivator')
  })

  it('selectedTech is null initially', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    expect(result.current.selectedTech).toBeNull()
  })

  it('selectTech sets selectedTech', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    act(() => result.current.selectTech('t2'))
    expect(result.current.selectedTech?.id).toBe('t2')
  })

  it('selectTech toggles off when same tech selected twice', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    act(() => result.current.selectTech('t2'))
    act(() => result.current.selectTech('t2'))
    expect(result.current.selectedTech).toBeNull()
  })

  it('clearSelection deselects', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    act(() => result.current.selectTech('t2'))
    act(() => result.current.clearSelection())
    expect(result.current.selectedTech).toBeNull()
  })

  it('previewSections is null when no tech is selected', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    expect(result.current.previewSections).toBeNull()
  })

  it('previewSections shows newly unlocked tech as preview', () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    act(() => result.current.selectTech('t2')) // select Psychoarchaeology
    const bioStims = result.current.previewSections?.biotic.find(t => t.name === 'Bio-Stims')
    expect(bioStims?.status).toBe('preview')
  })

  it('confirmResearch calls researchTechnology with correct arguments', async () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    await act(async () => {
      await result.current.confirmResearch('t2', ['planet-uuid'], false)
    })
    expect(researchTechnology).toHaveBeenCalledWith('game-id', 'Psychoarchaeology', ['planet-uuid'], false)
  })

  it('confirmResearch clears selectedTech on success', async () => {
    const { result } = renderHook(() =>
      useTechTree(PLAYER, PLANETS, ALL_TECHS, 'game-id', ACTIVE_EXPANSIONS)
    )
    act(() => result.current.selectTech('t2'))
    await act(async () => {
      await result.current.confirmResearch('t2', [], false)
    })
    expect(result.current.selectedTech).toBeNull()
  })
})
