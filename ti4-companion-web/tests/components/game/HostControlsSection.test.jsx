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

const defaultProps = {
  isHost: true,
  game: { phase: 'action', round: 2 },
  players: PLAYERS,
  objectives: OBJECTIVES,
  onScoreObjective: vi.fn(),
  onRevealObjective: vi.fn(),
  onShuffleDeck: vi.fn(),
  onAdvancePhase: vi.fn(),
}

const defaultStatusProps = {
  ...defaultProps,
  game: { phase: 'status', round: 2 },
  onEndStatusPhase: vi.fn(),
  pendingSecretPlayers: [],
  pendingTokenPlayers: [],
}

function renderControls(isHost = true) {
  return render(<HostControlsSection {...defaultProps} isHost={isHost} />)
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
    render(<HostControlsSection {...defaultStatusProps} />)
    expect(screen.getByRole('button', { name: /end status phase/i })).toBeInTheDocument()
  })

  it('shows pending secret selection banner', () => {
    render(<HostControlsSection {...defaultStatusProps} pendingSecretPlayers={[{ id: 'p2', display_name: 'Bob' }]} />)
    expect(screen.getAllByText(/bob/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/secret/i)).toBeInTheDocument()
  })

  it('calls onEndStatusPhase when End Status Phase is clicked', () => {
    const onEndStatusPhase = vi.fn()
    render(<HostControlsSection {...defaultStatusProps} onEndStatusPhase={onEndStatusPhase} />)
    fireEvent.click(screen.getByRole('button', { name: /end status phase/i }))
    expect(onEndStatusPhase).toHaveBeenCalledOnce()
  })

  it('does NOT render BEGIN AGENDA PHASE button', () => {
    render(
      <HostControlsSection
        {...defaultProps}
        game={{ phase: 'action', round: 2, agenda_phase_step: 'inactive' }}
        onEndStatusPhase={vi.fn()}
        onBeginAgendaPhase={vi.fn()}
        onEndAgendaPhase={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /begin agenda phase/i })).not.toBeInTheDocument()
  })
})
