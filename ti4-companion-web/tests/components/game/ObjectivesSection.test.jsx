import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ObjectivesSection from '../../../src/components/game/ObjectivesSection.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice' },
  { id: 'p2', display_name: 'Bob' },
]
const OBJECTIVES = [
  {
    id: 'go1', state: 'revealed', scored_by: ['p1'],
    public_objectives: { name: 'Spend 8 Resources', stage: 1, points: 1 },
  },
  {
    id: 'go2', state: 'revealed', scored_by: [],
    public_objectives: { name: 'Control 6 Planets', stage: 1, points: 1 },
  },
  {
    id: 'go3', state: 'deck', scored_by: [],
    public_objectives: { name: 'Secret Deck Card', stage: 2, points: 2 },
  },
]

describe('ObjectivesSection', () => {
  it('renders revealed objective names', () => {
    render(<ObjectivesSection objectives={OBJECTIVES} players={PLAYERS} />)
    expect(screen.getByText('Spend 8 Resources')).toBeInTheDocument()
    expect(screen.getByText('Control 6 Planets')).toBeInTheDocument()
  })

  it('does not render deck objectives', () => {
    render(<ObjectivesSection objectives={OBJECTIVES} players={PLAYERS} />)
    expect(screen.queryByText('Secret Deck Card')).not.toBeInTheDocument()
  })

  it('shows scorer display names for scored objectives', () => {
    render(<ObjectivesSection objectives={OBJECTIVES} players={PLAYERS} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows empty state when no objectives are revealed', () => {
    render(<ObjectivesSection objectives={[]} players={PLAYERS} />)
    expect(screen.getByText(/no objectives revealed/i)).toBeInTheDocument()
  })

  it('shows Score button for unscored objectives during status phase', () => {
    render(
      <ObjectivesSection
        objectives={OBJECTIVES}
        players={PLAYERS}
        game={{ phase: 'status' }}
        currentPlayerId="p2"
        onScore={vi.fn()}
      />
    )
    // p2 has not scored either revealed objective; should see score buttons
    expect(screen.getAllByRole('button', { name: /score/i })).toHaveLength(2)
  })

  it('does not show Score button for already-scored objectives', () => {
    render(
      <ObjectivesSection
        objectives={OBJECTIVES}
        players={PLAYERS}
        game={{ phase: 'status' }}
        currentPlayerId="p1"
        onScore={vi.fn()}
      />
    )
    // p1 already scored 'Spend 8 Resources' (scored_by includes p1)
    // There are 2 revealed objectives; p1 hasn't scored the second
    // So one score button visible (for Control 6 Planets)
    const scoreBtns = screen.queryAllByRole('button', { name: /score/i })
    // Spend 8 Resources has no score button for p1; Control 6 Planets does
    expect(scoreBtns).toHaveLength(1)
  })

  it('does not show Score buttons outside status phase', () => {
    render(
      <ObjectivesSection
        objectives={OBJECTIVES}
        players={PLAYERS}
        game={{ phase: 'action' }}
        currentPlayerId="p2"
        onScore={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /score/i })).not.toBeInTheDocument()
  })

  it('calls onScore with objective id when Score button clicked', () => {
    const onScore = vi.fn()
    render(
      <ObjectivesSection
        objectives={OBJECTIVES}
        players={PLAYERS}
        game={{ phase: 'status' }}
        currentPlayerId="p2"
        onScore={onScore}
      />
    )
    fireEvent.click(screen.getAllByRole('button', { name: /score/i })[0])
    expect(onScore).toHaveBeenCalledWith(expect.any(String))
  })
})
