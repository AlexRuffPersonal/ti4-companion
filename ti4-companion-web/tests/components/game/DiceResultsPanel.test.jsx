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

  it('renders each die roll value', () => {
    render(<DiceResultsPanel dice={DICE} label="Attacker" />)
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
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