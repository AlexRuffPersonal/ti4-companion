import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('shows End Status Phase button during status phase', () => {
    render(
      <HostControlsSection
        isHost={true}
        game={{ phase: 'status', round: 2 }}
        players={PLAYERS}
        objectives={OBJECTIVES}
        onScoreObjective={vi.fn()}
        onRevealObjective={vi.fn()}
        onShuffleDeck={vi.fn()}
        onAdvancePhase={vi.fn()}
        onEndStatusPhase={vi.fn()}
        pendingSecretPlayers={[]}
        pendingTokenPlayers={[]}
      />
    )
    expect(screen.getByRole('button', { name: /end status phase/i })).toBeInTheDocument()
  })

  it('shows pending secret selection banner', () => {
    render(
      <HostControlsSection
        isHost={true}
        game={{ phase: 'status', round: 2 }}
        players={PLAYERS}
        objectives={OBJECTIVES}
        onScoreObjective={vi.fn()}
        onRevealObjective={vi.fn()}
        onShuffleDeck={vi.fn()}
        onAdvancePhase={vi.fn()}
        onEndStatusPhase={vi.fn()}
        pendingSecretPlayers={[{ id: 'p2', display_name: 'Bob' }]}
        pendingTokenPlayers={[]}
      />
    )
    expect(screen.getAllByText(/bob/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/secret/i)).toBeInTheDocument()
  })

  it('calls onEndStatusPhase when End Status Phase is clicked', () => {
    const onEndStatusPhase = vi.fn()
    render(
      <HostControlsSection
        isHost={true}
        game={{ phase: 'status', round: 2 }}
        players={PLAYERS}
        objectives={OBJECTIVES}
        onScoreObjective={vi.fn()}
        onRevealObjective={vi.fn()}
        onShuffleDeck={vi.fn()}
        onAdvancePhase={vi.fn()}
        onEndStatusPhase={onEndStatusPhase}
        pendingSecretPlayers={[]}
        pendingTokenPlayers={[]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /end status phase/i }))
    expect(onEndStatusPhase).toHaveBeenCalledOnce()
  })
})
