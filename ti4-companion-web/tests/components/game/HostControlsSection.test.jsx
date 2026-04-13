import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HostControlsSection from '../../../src/components/game/HostControlsSection.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice', vp: 5 },
  { id: 'p2', display_name: 'Bob',   vp: 3 },
]
const OBJECTIVES = [
  {
    id: 'go1', state: 'revealed', scored_by: [],
    public_objectives: { name: 'Spend 8 Resources', stage: 1, points: 1 },
  },
]

function renderControls(isHost = true) {
  return render(
    <HostControlsSection
      isHost={isHost}
      game={{ phase: 'action', round: 2 }}
      players={PLAYERS}
      objectives={OBJECTIVES}
      onScoreObjective={vi.fn()}
      onRevealObjective={vi.fn()}
      onShuffleDeck={vi.fn()}
      onAdvancePhase={vi.fn()}
    />
  )
}

describe('HostControlsSection', () => {
  it('renders Advance Phase button for host', () => {
    renderControls(true)
    expect(screen.getByRole('button', { name: /advance phase/i })).toBeInTheDocument()
  })

  it('renders Reveal Objective button for host', () => {
    renderControls(true)
    expect(screen.getByRole('button', { name: /reveal objective/i })).toBeInTheDocument()
  })

  it('renders Shuffle Deck button for host', () => {
    renderControls(true)
    expect(screen.getByRole('button', { name: /shuffle/i })).toBeInTheDocument()
  })

  it('renders nothing for non-host', () => {
    const { container } = renderControls(false)
    expect(container.firstChild).toBeNull()
  })
})
