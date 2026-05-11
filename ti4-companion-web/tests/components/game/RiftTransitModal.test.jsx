import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RiftTransitModal from '../../../src/components/game/RiftTransitModal.jsx'

const transit = {
  player_id: 'p1',
  system_key: '3,2',
  ships: [
    { unit_id: 'u1', unit_type: 'cruiser', cargo: [], roll: null, destroyed: false },
    { unit_id: 'u2', unit_type: 'destroyer', cargo: [{ unit_type: 'Fighter', count: 2 }], roll: 5, destroyed: false },
  ]
}
const players = [{ id: 'p1', faction_name: 'Arborec' }]
const tileMap = { '3,2': { name: 'Mecatol Rex' } }

function renderModal(overrides = {}, transitOverrides = {}) {
  const props = {
    transit: { ...transit, ...transitOverrides },
    myPlayerId: 'p1',
    players,
    tileMap,
    onRollAll: vi.fn(),
    onRollOne: vi.fn(),
    onClose: vi.fn(),
    loading: false,
    error: null,
    ...overrides,
  }
  return { ...render(<RiftTransitModal {...props} />), props }
}

describe('RiftTransitModal', () => {
  it('renders null when transit=null', () => {
    const { container } = render(
      <RiftTransitModal
        transit={null}
        myPlayerId="p1"
        players={players}
        tileMap={tileMap}
        onRollAll={vi.fn()}
        onRollOne={vi.fn()}
        onClose={vi.fn()}
        loading={false}
        error={null}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows system name in header', () => {
    renderModal()
    expect(screen.getByText('GRAVITY RIFT — Mecatol Rex')).toBeInTheDocument()
  })

  it('shows each ship row with unit_type', () => {
    renderModal()
    expect(screen.getByText(/cruiser/)).toBeInTheDocument()
    expect(screen.getByText(/destroyer/)).toBeInTheDocument()
  })

  it('shows cargo summary for u2', () => {
    renderModal()
    expect(screen.getByText(/2 Fighter/)).toBeInTheDocument()
  })

  it('shows "—" for unrolled ship u1', () => {
    renderModal()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows roll result "5" for u2', () => {
    renderModal()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('shows SAFE badge for u2 (destroyed=false, rolled)', () => {
    renderModal()
    expect(screen.getByText('SAFE')).toBeInTheDocument()
  })

  it('shows DESTROYED badge when destroyed=true', () => {
    renderModal({}, {
      ships: [
        { unit_id: 'u1', unit_type: 'cruiser', cargo: [], roll: 2, destroyed: true },
      ]
    })
    expect(screen.getByText('DESTROYED')).toBeInTheDocument()
  })

  it('shows Roll All and Roll One buttons for active player with unrolled ships', () => {
    renderModal({ myPlayerId: 'p1' })
    expect(screen.getByText('Roll All')).toBeInTheDocument()
    expect(screen.getByText('Roll One')).toBeInTheDocument()
  })

  it('Roll All calls onRollAll', () => {
    const onRollAll = vi.fn()
    renderModal({ onRollAll })
    fireEvent.click(screen.getByText('Roll All'))
    expect(onRollAll).toHaveBeenCalled()
  })

  it('Roll One calls onRollOne with u1 (first unrolled)', () => {
    const onRollOne = vi.fn()
    renderModal({ onRollOne })
    fireEvent.click(screen.getByText('Roll One'))
    expect(onRollOne).toHaveBeenCalledWith('u1')
  })

  it('Roll One disabled when all ships rolled', () => {
    renderModal({}, {
      ships: [
        { unit_id: 'u1', unit_type: 'cruiser', cargo: [], roll: 4, destroyed: false },
        { unit_id: 'u2', unit_type: 'destroyer', cargo: [], roll: 5, destroyed: false },
      ]
    })
    // allRolled = true, so roll buttons not shown
    expect(screen.queryByText('Roll One')).not.toBeInTheDocument()
  })

  it('no roll buttons and waiting message shown for non-active player', () => {
    renderModal({ myPlayerId: 'p2' })
    expect(screen.queryByText('Roll All')).not.toBeInTheDocument()
    expect(screen.queryByText('Roll One')).not.toBeInTheDocument()
    expect(screen.getByText(/Waiting for Arborec/)).toBeInTheDocument()
  })

  it('allRolled shows summary and Done button for active player', () => {
    renderModal({}, {
      ships: [
        { unit_id: 'u1', unit_type: 'cruiser', cargo: [], roll: 4, destroyed: true },
        { unit_id: 'u2', unit_type: 'destroyer', cargo: [], roll: 5, destroyed: false },
      ]
    })
    expect(screen.getByText(/1 destroyed/)).toBeInTheDocument()
    expect(screen.getByText(/1 survived/)).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('Done calls onClose', () => {
    const onClose = vi.fn()
    renderModal({ onClose }, {
      ships: [
        { unit_id: 'u1', unit_type: 'cruiser', cargo: [], roll: 4, destroyed: false },
      ]
    })
    fireEvent.click(screen.getByText('Done'))
    expect(onClose).toHaveBeenCalled()
  })

  it('loading=true disables Roll All and Roll One', () => {
    renderModal({ loading: true })
    expect(screen.getByText('Roll All')).toBeDisabled()
    expect(screen.getByText('Roll One')).toBeDisabled()
  })

  it('error prop shown in red', () => {
    renderModal({ error: 'Something went wrong' })
    const errEl = screen.getByText('Something went wrong')
    expect(errEl).toBeInTheDocument()
    expect(errEl.className).toContain('text-danger')
  })
})
