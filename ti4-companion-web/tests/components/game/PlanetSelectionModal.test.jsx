// tests/components/game/PlanetSelectionModal.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PlanetSelectionModal from '../../../src/components/game/PlanetSelectionModal.jsx'

const ALL_PLANETS = [
  { id: 'pl-1', planet_name: 'Nestphar', player_id: 'p1', exhausted: false, influence: 3, resources: 1, trait: 'cultural' },
  { id: 'pl-2', planet_name: 'Lazar',    player_id: 'p1', exhausted: false, influence: 1, resources: 2, trait: 'industrial' },
  { id: 'pl-3', planet_name: 'Sakulag',  player_id: 'p1', exhausted: true,  influence: 2, resources: 1, trait: 'hazardous' },
  { id: 'pl-4', planet_name: 'Mecatol',  player_id: 'p2', exhausted: false, influence: 1, resources: 1, trait: null },
]

const DEFAULT_PROPS = {
  planets: ALL_PLANETS,
  currentPlayerId: 'p1',
  scope: 'own',
  filter: 'non-exhausted',
  selectionMode: 'multi',
  valueMode: 'influence',
  label: 'Select planets to exhaust',
  onConfirm: vi.fn(),
  onClose: vi.fn(),
}

function renderModal(overrides = {}) {
  return render(<PlanetSelectionModal {...DEFAULT_PROPS} {...overrides} />)
}

describe('PlanetSelectionModal', () => {
  it('shows the label', () => {
    renderModal()
    expect(screen.getByText('Select planets to exhaust')).toBeInTheDocument()
  })

  it('scope=own shows only current player planets', () => {
    renderModal()
    expect(screen.getByText('Nestphar')).toBeInTheDocument()
    expect(screen.queryByText('Mecatol')).not.toBeInTheDocument()
  })

  it('filter=non-exhausted hides exhausted planets', () => {
    renderModal()
    expect(screen.queryByText('Sakulag')).not.toBeInTheDocument()
  })

  it('filter=all shows exhausted planets', () => {
    renderModal({ filter: 'all' })
    expect(screen.getByText('Sakulag')).toBeInTheDocument()
  })

  it('scope=any-player shows all players planets', () => {
    renderModal({ scope: 'any-player', filter: 'all' })
    expect(screen.getByText('Mecatol')).toBeInTheDocument()
  })

  it('multi selection toggles planet in/out', () => {
    const onConfirm = vi.fn()
    renderModal({ onConfirm })
    fireEvent.click(screen.getByText('Nestphar'))
    fireEvent.click(screen.getByText('Lazar'))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith(['pl-1', 'pl-2'])
  })

  it('single selection replaces previous selection', () => {
    const onConfirm = vi.fn()
    renderModal({ selectionMode: 'single', filter: 'all', onConfirm })
    fireEvent.click(screen.getByText('Nestphar'))
    fireEvent.click(screen.getByText('Lazar'))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith(['pl-2'])
  })

  it('valueMode=influence shows influence total', () => {
    renderModal()
    fireEvent.click(screen.getByText('Nestphar'))
    // influence: 3 selected
    expect(screen.getByText('Total:')).toBeInTheDocument()
    expect(screen.getByText((_, element) => element?.textContent === '3' && element?.className.includes('font-display'))).toBeInTheDocument()
  })

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
