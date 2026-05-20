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

  it('shows scorer dot for scored objectives', () => {
    const { container } = render(<ObjectivesSection objectives={OBJECTIVES} players={PLAYERS} />)
    // Alice (p1) scored 'Spend 8 Resources' — her dot should be text-success with title="Alice"
    const aliceDot = container.querySelector('span.text-success[title="Alice"]')
    expect(aliceDot).toBeInTheDocument()
    expect(aliceDot.textContent).toBe('•')
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

  it('renders condition text when ref.condition is non-empty', () => {
    const objsWithCondition = [
      {
        id: 'go1', state: 'revealed', scored_by: [],
        public_objectives: { name: 'Spend 8 Resources', stage: 1, points: 1, condition: 'Spend a total of 8 resources.' },
      },
    ]
    render(<ObjectivesSection objectives={objsWithCondition} players={PLAYERS} />)
    expect(screen.getByTestId('objective-condition')).toBeInTheDocument()
    expect(screen.getByTestId('objective-condition').textContent).toBe('Spend a total of 8 resources.')
  })

  it('does not render condition paragraph when ref.condition is null', () => {
    const objsNoCondition = [
      {
        id: 'go1', state: 'revealed', scored_by: [],
        public_objectives: { name: 'Spend 8 Resources', stage: 1, points: 1, condition: null },
      },
    ]
    render(<ObjectivesSection objectives={objsNoCondition} players={PLAYERS} />)
    expect(screen.queryByTestId('objective-condition')).not.toBeInTheDocument()
  })

  it('condition text renders below name and VP line', () => {
    const objsWithCondition = [
      {
        id: 'go1', state: 'revealed', scored_by: [],
        public_objectives: { name: 'Spend 8 Resources', stage: 1, points: 1, condition: 'Spend a total of 8 resources.' },
      },
    ]
    const { container } = render(<ObjectivesSection objectives={objsWithCondition} players={PLAYERS} />)
    const nameEl = screen.getByText('Spend 8 Resources')
    const conditionEl = screen.getByTestId('objective-condition')
    // condition should come after the name in DOM order
    expect(nameEl.compareDocumentPosition(conditionEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
