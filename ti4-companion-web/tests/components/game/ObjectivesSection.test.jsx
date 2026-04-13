import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
