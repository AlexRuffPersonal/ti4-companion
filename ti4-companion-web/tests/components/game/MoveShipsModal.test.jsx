import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MoveShipsModal from '../../../src/components/game/MoveShipsModal.jsx'

// Mock useMovement
const mockMovement = {
  selectedShips: [],
  setSelectedShips: vi.fn(),
  excessRemovals: [],
  setExcessRemovals: vi.fn(),
  reachableSystems: vi.fn(() => ['1,1', '2,2']),
  capacityRemaining: vi.fn(() => 4),
  excessBySystem: vi.fn(() => ({})),
  isReadyToConfirm: vi.fn(() => true),
  confirmMove: vi.fn().mockResolvedValue({}),
  reset: vi.fn(),
}

vi.mock('../../../src/hooks/useMovement.js', () => ({
  useMovement: vi.fn(() => mockMovement),
}))

const eligibleUnit = {
  id: 'u1',
  unit_type: 'carrier',
  player_id: 'p1',
  on_planet: null,
  system_key: '0,0',
}

const defaultProps = {
  gameId: 'g1',
  game: {},
  activeSystemKey: '0,0',
  tileData: {},
  mapTiles: {},
  systemUnits: [eligibleUnit],
  myPlayerId: 'p1',
  myTokenSystems: [],
  unitDefs: { carrier: { move: 1, capacity: 4 } },
  onClose: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMovement.selectedShips = []
  mockMovement.excessBySystem.mockReturnValue({})
  mockMovement.isReadyToConfirm.mockReturnValue(true)
  mockMovement.reachableSystems.mockReturnValue(['1,1', '2,2'])
  mockMovement.confirmMove.mockResolvedValue({})
})

function renderModal(overrides = {}) {
  const props = { ...defaultProps, ...overrides }
  return render(<MoveShipsModal {...props} />)
}

describe('MoveShipsModal', () => {
  it('renders Step 1 with eligible ships listed', () => {
    renderModal()
    expect(screen.getByText('Step 1 — Select Ships to Move')).toBeInTheDocument()
    expect(screen.getByText('carrier (0,0)')).toBeInTheDocument()
  })

  it('toggling a ship calls setSelectedShips', () => {
    renderModal()
    fireEvent.click(screen.getByText('carrier (0,0)'))
    expect(mockMovement.setSelectedShips).toHaveBeenCalled()
  })

  it('"Next: Draw Routes" disabled when selectedShips empty', () => {
    renderModal()
    const btn = screen.getByText('Next: Draw Routes')
    expect(btn).toBeDisabled()
  })

  it('"Skip Movement" calls onClose', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByText('Skip Movement'))
    expect(onClose).toHaveBeenCalled()
  })

  it('Step 2 renders ship label and reachable systems', async () => {
    // Set selectedShips so Next button is enabled
    mockMovement.selectedShips = [{
      unit_id: 'u1',
      unit_type: 'carrier',
      origin_system_key: '0,0',
      path: ['0,0'],
      cargo: [],
      moveValue: 1,
      capacity: 4,
    }]
    renderModal()
    fireEvent.click(screen.getByText('Next: Draw Routes'))
    expect(screen.getByText('Step 2 — carrier from 0,0')).toBeInTheDocument()
    expect(screen.getByText('1,1')).toBeInTheDocument()
    expect(screen.getByText('2,2')).toBeInTheDocument()
  })

  it('clicking a reachable system calls setSelectedShips (adds hop)', async () => {
    mockMovement.selectedShips = [{
      unit_id: 'u1',
      unit_type: 'carrier',
      origin_system_key: '0,0',
      path: ['0,0'],
      cargo: [],
      moveValue: 1,
      capacity: 4,
    }]
    renderModal()
    fireEvent.click(screen.getByText('Next: Draw Routes'))
    fireEvent.click(screen.getByText('1,1'))
    expect(mockMovement.setSelectedShips).toHaveBeenCalled()
  })

  it('"Done with this ship" when on last ship advances to Step 3', () => {
    mockMovement.selectedShips = [{
      unit_id: 'u1',
      unit_type: 'carrier',
      origin_system_key: '0,0',
      path: ['0,0'],
      cargo: [],
      moveValue: 1,
      capacity: 4,
    }]
    renderModal()
    fireEvent.click(screen.getByText('Next: Draw Routes'))
    fireEvent.click(screen.getByText('Done with this ship'))
    expect(screen.getByText('Step 3 — Resolve Excess Capacity')).toBeInTheDocument()
  })

  it('Step 3 shows "No excess" when excessBySystem returns {}', () => {
    mockMovement.selectedShips = [{
      unit_id: 'u1',
      unit_type: 'carrier',
      origin_system_key: '0,0',
      path: ['0,0'],
      cargo: [],
      moveValue: 1,
      capacity: 4,
    }]
    renderModal()
    fireEvent.click(screen.getByText('Next: Draw Routes'))
    fireEvent.click(screen.getByText('Done with this ship'))
    expect(screen.getByText(/No excess units/)).toBeInTheDocument()
  })

  it('Step 3 "Confirm Movement" enabled when isReadyToConfirm=true → calls confirmMove then onClose', async () => {
    const onClose = vi.fn()
    mockMovement.selectedShips = [{
      unit_id: 'u1',
      unit_type: 'carrier',
      origin_system_key: '0,0',
      path: ['0,0'],
      cargo: [],
      moveValue: 1,
      capacity: 4,
    }]
    renderModal({ onClose })
    fireEvent.click(screen.getByText('Next: Draw Routes'))
    fireEvent.click(screen.getByText('Done with this ship'))
    const confirmBtn = screen.getByText('Confirm Movement')
    expect(confirmBtn).not.toBeDisabled()
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(mockMovement.confirmMove).toHaveBeenCalled())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('Step 3 "Confirm Movement" disabled when isReadyToConfirm=false', () => {
    mockMovement.isReadyToConfirm.mockReturnValue(false)
    mockMovement.selectedShips = [{
      unit_id: 'u1',
      unit_type: 'carrier',
      origin_system_key: '0,0',
      path: ['0,0'],
      cargo: [],
      moveValue: 1,
      capacity: 4,
    }]
    renderModal()
    fireEvent.click(screen.getByText('Next: Draw Routes'))
    fireEvent.click(screen.getByText('Done with this ship'))
    expect(screen.getByText('Confirm Movement')).toBeDisabled()
  })

  it('error from confirmMove rejection shown in red', async () => {
    mockMovement.confirmMove.mockRejectedValue(new Error('Movement failed'))
    mockMovement.selectedShips = [{
      unit_id: 'u1',
      unit_type: 'carrier',
      origin_system_key: '0,0',
      path: ['0,0'],
      cargo: [],
      moveValue: 1,
      capacity: 4,
    }]
    renderModal()
    fireEvent.click(screen.getByText('Next: Draw Routes'))
    fireEvent.click(screen.getByText('Done with this ship'))
    fireEvent.click(screen.getByText('Confirm Movement'))
    await waitFor(() => {
      const errEl = screen.getByText('Movement failed')
      expect(errEl).toBeInTheDocument()
      expect(errEl.className).toContain('text-danger')
    })
  })
})
