import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProductionModal from '../../../src/components/game/ProductionModal.jsx'

const MY_PLAYER_ID = 'p1'
const SYSTEM_KEY = '1,-1'

const UNIT_DEFS = {
  carrier: { cost: '3', production: '3' },
  cruiser: { cost: null, production: null },   // not buildable (no cost)
  infantry: { cost: '1', production: null },
  space_dock: { cost: null, production: '5' }, // not buildable (no cost), but provides capacity
}

// System units: player has a space dock (production=5) and a cruiser (no production)
const SYSTEM_UNITS = [
  { id: 'u1', player_id: MY_PLAYER_ID, unit_type: 'space_dock', count: 1, system_key: SYSTEM_KEY },
  { id: 'u2', player_id: MY_PLAYER_ID, unit_type: 'cruiser', count: 1, system_key: SYSTEM_KEY },
  { id: 'u3', player_id: 'p2', unit_type: 'carrier', count: 1, system_key: SYSTEM_KEY },
]

const MY_PLANETS = [
  { id: 'pl1', planet_name: 'Mecatol Rex', resources: 2, exhausted: false },
  { id: 'pl2', planet_name: 'Wellon', resources: 3, exhausted: false },
]

const BASE_PROPS = {
  gameId: 'game1',
  systemKey: SYSTEM_KEY,
  systemUnits: SYSTEM_UNITS,
  myPlayerId: MY_PLAYER_ID,
  myPlanets: MY_PLANETS,
  unitDefs: UNIT_DEFS,
  onProduce: vi.fn(),
  onClose: vi.fn(),
}

describe('ProductionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes totalCapacity from production stats of system units', () => {
    render(<ProductionModal {...BASE_PROPS} />)
    // space_dock has production=5; cruiser has no production; opponent carrier ignored
    // capacity = parseInt('5') = 5
    expect(screen.getByText(/Capacity: 0\/5/)).toBeInTheDocument()
  })

  it('renders unit picker with cost labels', () => {
    render(<ProductionModal {...BASE_PROPS} />)
    // carrier has cost=3, infantry has cost=1 — both buildable
    expect(screen.getByText(/carrier/i)).toBeInTheDocument()
    expect(screen.getByText(/infantry/i)).toBeInTheDocument()
    // space_dock has cost=null so not buildable
    // cost labels visible
    expect(screen.getByText(/cost: 3/i)).toBeInTheDocument()
    expect(screen.getByText(/cost: 1/i)).toBeInTheDocument()
  })

  it('disables PRODUCE when unit count exceeds capacity', () => {
    render(<ProductionModal {...BASE_PROPS} />)
    // Add 6 carriers (capacity is 5)
    const plusButtons = screen.getAllByText('+')
    // carrier should be first buildable unit
    const carrierPlus = plusButtons[0]
    for (let i = 0; i < 6; i++) fireEvent.click(carrierPlus)
    expect(screen.getByRole('button', { name: /produce/i })).toBeDisabled()
  })

  it('disables PRODUCE when resources < cost', () => {
    render(<ProductionModal {...BASE_PROPS} />)
    // Add 1 carrier (cost=3), exhaust no planets → resources=0 < 3
    const plusButtons = screen.getAllByText('+')
    fireEvent.click(plusButtons[0])
    expect(screen.getByRole('button', { name: /produce/i })).toBeDisabled()
  })

  it('enables PRODUCE when count <= capacity and resources >= cost', () => {
    render(<ProductionModal {...BASE_PROPS} />)
    // Add 1 carrier (cost=3), exhaust Wellon (resources=3)
    const plusButtons = screen.getAllByText('+')
    fireEvent.click(plusButtons[0]) // +1 carrier

    // Exhaust Wellon (resources=3)
    fireEvent.click(screen.getByText('Wellon'))
    expect(screen.getByRole('button', { name: /produce/i })).not.toBeDisabled()
  })

  it('shows planet picker for ground forces when count > 0', () => {
    render(<ProductionModal {...BASE_PROPS} />)
    // Find infantry + button
    const allPlusButtons = screen.getAllByText('+')
    // infantry is the second buildable unit (after carrier)
    const infantryPlus = allPlusButtons[1]
    fireEvent.click(infantryPlus)
    // planet picker/select should appear
    expect(screen.getByLabelText(/planet for infantry/i)).toBeInTheDocument()
  })

  it('calls onProduce with correct payload on submit', () => {
    render(<ProductionModal {...BASE_PROPS} />)
    const plusButtons = screen.getAllByText('+')
    fireEvent.click(plusButtons[0]) // +1 carrier (cost=3)

    // Exhaust Wellon (resources=3) → total=3 >= cost=3
    fireEvent.click(screen.getByText('Wellon'))

    fireEvent.click(screen.getByRole('button', { name: /produce/i }))
    expect(BASE_PROPS.onProduce).toHaveBeenCalledWith({
      systemKey: SYSTEM_KEY,
      units: { carrier: 1 },
      planet_exhausts: ['Wellon'],
    })
  })

  it('calls onClose on CANCEL', () => {
    render(<ProductionModal {...BASE_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(BASE_PROPS.onClose).toHaveBeenCalled()
  })
})
