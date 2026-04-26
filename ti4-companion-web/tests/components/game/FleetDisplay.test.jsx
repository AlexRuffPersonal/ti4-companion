import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FleetDisplay from '../../../src/components/game/FleetDisplay.jsx'

const UNITS = [
  { id: 'u1', unit_type: 'carrier', count: 2, damaged: false },
  { id: 'u2', unit_type: 'dreadnought', count: 1, damaged: false },
  { id: 'u3', unit_type: 'fighter', count: 3, damaged: false },
]

const UNIT_DEFS = new Map([
  ['carrier', { sustain_damage: false }],
  ['dreadnought', { sustain_damage: true }],
  ['fighter', { sustain_damage: false }],
])

const BASE_PROPS = {
  units: UNITS,
  unitDefs: UNIT_DEFS,
  isInteractive: false,
  hitsToAssign: 0,
  onConfirm: vi.fn(),
}

describe('FleetDisplay', () => {
  it('renders a chip for each unit type with count', () => {
    render(<FleetDisplay {...BASE_PROPS} />)
    expect(screen.getByText(/carrier/i)).toBeInTheDocument()
    expect(screen.getByText(/dreadnought/i)).toBeInTheDocument()
    expect(screen.getByText(/fighter/i)).toBeInTheDocument()
  })

  it('shows ⚡ icon on damaged units', () => {
    const damagedUnits = [{ id: 'u2', unit_type: 'dreadnought', count: 1, damaged: true }]
    render(<FleetDisplay {...BASE_PROPS} units={damagedUnits} />)
    expect(screen.getByText('⚡')).toBeInTheDocument()
  })

  it('does not show Confirm button when not interactive', () => {
    render(<FleetDisplay {...BASE_PROPS} />)
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
  })

  it('shows Confirm button when interactive', () => {
    render(<FleetDisplay {...BASE_PROPS} isInteractive hitsToAssign={1} />)
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
  })

  it('Confirm button is disabled until all hits assigned', () => {
    render(<FleetDisplay {...BASE_PROPS} isInteractive hitsToAssign={1} />)
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()
  })

  it('clicking a chip once marks it for destroy', () => {
    render(<FleetDisplay {...BASE_PROPS} isInteractive hitsToAssign={1} />)
    const chip = screen.getByTestId('chip-u1')
    fireEvent.click(chip)
    expect(chip).toHaveClass('border-danger')
  })

  it('clicking a sustain-capable chip marks it for sustain on first click', () => {
    render(<FleetDisplay {...BASE_PROPS} isInteractive hitsToAssign={1} />)
    const chip = screen.getByTestId('chip-u2')
    fireEvent.click(chip)
    expect(chip).toHaveClass('border-warning')
  })

  it('Confirm button enables when correct number of hits assigned', () => {
    render(<FleetDisplay {...BASE_PROPS} isInteractive hitsToAssign={1} />)
    fireEvent.click(screen.getByTestId('chip-u1'))
    expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled()
  })

  it('calls onConfirm with casualties when Confirm clicked', () => {
    const onConfirm = vi.fn()
    render(<FleetDisplay {...BASE_PROPS} isInteractive hitsToAssign={1} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByTestId('chip-u1'))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ player_unit_id: 'u1', action: 'destroy' }),
    ])
  })

  it('does not allow sustain on already-damaged unit', () => {
    const damagedDread = [{ id: 'u2', unit_type: 'dreadnought', count: 1, damaged: true }]
    render(<FleetDisplay {...BASE_PROPS} units={damagedDread} isInteractive hitsToAssign={1} />)
    const chip = screen.getByTestId('chip-u2')
    fireEvent.click(chip)
    // Should go straight to destroy (red), not sustain (amber)
    expect(chip).toHaveClass('border-danger')
  })
})