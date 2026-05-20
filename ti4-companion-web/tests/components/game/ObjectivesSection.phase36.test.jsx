import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ObjectivesSection from '../../../src/components/game/ObjectivesSection.jsx'
import { evaluateCondition } from '../../../src/lib/objectiveEvaluator.js'

vi.mock('../../../src/lib/objectiveEvaluator.js', () => ({ evaluateCondition: vi.fn() }))

const PLAYERS = [
  { id: 'p1', display_name: 'Alice' },
  { id: 'p2', display_name: 'Bob' },
]

function makeObjective(overrides = {}) {
  return {
    id: 'go1',
    state: 'revealed',
    scored_by: [],
    public_objectives: { name: 'Spend 8 Resources', stage: 1, points: 1, condition_check: 'someCheck' },
    ...overrides,
  }
}

describe('ObjectivesSection — Phase 36 eligibility', () => {
  beforeEach(() => {
    vi.mocked(evaluateCondition).mockReset()
  })

  it('enables SCORE button when condition_check is null', () => {
    const obj = {
      id: 'go1',
      state: 'revealed',
      scored_by: [],
      public_objectives: { name: 'Spend 8 Resources', stage: 1, points: 1, condition_check: null },
    }
    render(
      <ObjectivesSection
        objectives={[obj]}
        players={PLAYERS}
        game={{ phase: 'status' }}
        currentPlayerId="p1"
        onScore={vi.fn()}
        evaluationCtxByPlayer={{ p1: {} }}
      />
    )
    const btn = screen.getByRole('button', { name: /score/i })
    expect(btn).not.toBeDisabled()
  })

  it('disables SCORE button when evaluateCondition returns ineligible', () => {
    vi.mocked(evaluateCondition).mockReturnValue({ eligible: false, reason: 'Need more resources' })
    const obj = makeObjective()
    render(
      <ObjectivesSection
        objectives={[obj]}
        players={PLAYERS}
        game={{ phase: 'status' }}
        currentPlayerId="p1"
        onScore={vi.fn()}
        evaluationCtxByPlayer={{ p1: { resources: 0 }, p2: { resources: 0 } }}
      />
    )
    const btn = screen.getByRole('button', { name: /score/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'Need more resources')
  })

  it('enables SCORE button when evaluateCondition returns eligible', () => {
    vi.mocked(evaluateCondition).mockReturnValue({ eligible: true, reason: '' })
    const obj = makeObjective()
    render(
      <ObjectivesSection
        objectives={[obj]}
        players={PLAYERS}
        game={{ phase: 'status' }}
        currentPlayerId="p1"
        onScore={vi.fn()}
        evaluationCtxByPlayer={{ p1: { resources: 10 }, p2: { resources: 10 } }}
      />
    )
    const btn = screen.getByRole('button', { name: /score/i })
    expect(btn).not.toBeDisabled()
  })

  it('shows gray dot for ineligible player', () => {
    vi.mocked(evaluateCondition).mockImplementation((check, ctx) => {
      return ctx.eligible ? { eligible: true, reason: '' } : { eligible: false, reason: 'Not enough' }
    })
    const obj = makeObjective()
    const { container } = render(
      <ObjectivesSection
        objectives={[obj]}
        players={PLAYERS}
        game={{ phase: 'status' }}
        currentPlayerId="p1"
        onScore={vi.fn()}
        evaluationCtxByPlayer={{
          p1: { eligible: true },
          p2: { eligible: false },
        }}
      />
    )
    // p2 is ineligible — their dot should have text-dim class
    const dimDots = container.querySelectorAll('span.text-dim[title="Not enough"]')
    expect(dimDots.length).toBeGreaterThan(0)
  })
})
