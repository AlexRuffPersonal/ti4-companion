import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DiceResultsPanel from '../../../src/components/game/DiceResultsPanel.jsx'

const DICE = [
  { unit_type: 'cruiser', roll: 8, hit: true },
  { unit_type: 'cruiser', roll: 3, hit: false },
  { unit_type: 'destroyer', roll: 9, hit: true },
]

describe('DiceResultsPanel', () => {
  it('renders label', () => {
    render(<DiceResultsPanel dice={DICE} label="Attacker" />)
    expect(screen.getByText(/attacker/i)).toBeInTheDocument()
  })

  it('renders hit icon for each hit die', () => {
    render(<DiceResultsPanel dice={DICE} label="Attacker" />)
    const hitIcons = screen.getAllByRole('img', { name: 'hit' })
    expect(hitIcons).toHaveLength(2) // DICE has 2 hits
  })

  it('renders miss icon for each miss die', () => {
    render(<DiceResultsPanel dice={DICE} label="Attacker" />)
    const missIcons = screen.getAllByRole('img', { name: 'miss' })
    expect(missIcons).toHaveLength(1) // DICE has 1 miss
  })

  it('renders each die roll value as title attribute', () => {
    render(<DiceResultsPanel dice={DICE} label="Attacker" />)
    const spans = document.querySelectorAll('[title]')
    const titles = Array.from(spans).map(s => s.getAttribute('title'))
    expect(titles).toContain('8')
    expect(titles).toContain('3')
    expect(titles).toContain('9')
  })

  it('shows hit count', () => {
    render(<DiceResultsPanel dice={DICE} label="Attacker" />)
    expect(screen.getByText(/2 hit/i)).toBeInTheDocument()
  })

  it('renders nothing when dice is null', () => {
    const { container } = render(<DiceResultsPanel dice={null} label="Attacker" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when dice is empty', () => {
    const { container } = render(<DiceResultsPanel dice={[]} label="Attacker" />)
    expect(container.firstChild).toBeNull()
  })

  it('groups dice by unit type', () => {
    render(<DiceResultsPanel dice={DICE} label="Attacker" />)
    expect(screen.getByText(/cruiser/i)).toBeInTheDocument()
    expect(screen.getByText(/destroyer/i)).toBeInTheDocument()
  })
})