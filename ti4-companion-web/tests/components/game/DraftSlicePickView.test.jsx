import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DraftSlicePickView from '../../../src/components/game/DraftSlicePickView.jsx'

const TILE_BY_NUMBER = {
  '32': { tile_number: '32', planets: [{ resources: 2, influence: 1 }], wormhole: null, anomaly: false, type: 'blue' },
  '41': { tile_number: '41', planets: [], wormhole: 'alpha', anomaly: false, type: 'blue' },
  '45': { tile_number: '45', planets: [], wormhole: null, anomaly: true, type: 'anomaly' },
  '19': { tile_number: '19', planets: [{ resources: 1, influence: 2 }], wormhole: null, anomaly: false, type: 'red' },
}

const DRAFT_STATE = {
  mode: 'milty',
  phase: 'slice-pick',
  slices: [
    { id: 'slice-0', tiles: ['32', '41'], score: 5.0, claimed_by: null },
    { id: 'slice-1', tiles: ['45', '19'], score: 3.0, claimed_by: 'player-2' },
  ],
  pick_order: ['player-1', 'player-2'],
  pick_index: 0,
}

const CURRENT_PLAYER_ACTIVE = { id: 'player-1', display_name: 'Alice' }
const CURRENT_PLAYER_INACTIVE = { id: 'player-2', display_name: 'Bob' }

describe('DraftSlicePickView', () => {
  it('renders one card per slice', () => {
    render(<DraftSlicePickView draftState={DRAFT_STATE} tileByNumber={TILE_BY_NUMBER} currentPlayer={CURRENT_PLAYER_ACTIVE} onPickSlice={vi.fn()} pickError={null} />)
    expect(screen.getByText('Slice 1')).toBeInTheDocument()
    expect(screen.getByText('Slice 2')).toBeInTheDocument()
  })

  it('shows score for each slice', () => {
    render(<DraftSlicePickView draftState={DRAFT_STATE} tileByNumber={TILE_BY_NUMBER} currentPlayer={CURRENT_PLAYER_ACTIVE} onPickSlice={vi.fn()} pickError={null} />)
    expect(screen.getByText('5.0')).toBeInTheDocument()
    expect(screen.getByText('3.0')).toBeInTheDocument()
  })

  it('claimed slice has opacity class and shows "Claimed" text', () => {
    const { container } = render(<DraftSlicePickView draftState={DRAFT_STATE} tileByNumber={TILE_BY_NUMBER} currentPlayer={CURRENT_PLAYER_ACTIVE} onPickSlice={vi.fn()} pickError={null} />)
    expect(screen.getByText('Claimed')).toBeInTheDocument()
    // The slice card with claimed should have opacity-50
    const cards = container.querySelectorAll('.panel')
    const claimedCard = Array.from(cards).find(c => c.className.includes('opacity-50'))
    expect(claimedCard).toBeTruthy()
  })

  it('active picker: unclaimed slices show Pick button', () => {
    render(<DraftSlicePickView draftState={DRAFT_STATE} tileByNumber={TILE_BY_NUMBER} currentPlayer={CURRENT_PLAYER_ACTIVE} onPickSlice={vi.fn()} pickError={null} />)
    expect(screen.getByRole('button', { name: /pick this slice/i })).toBeInTheDocument()
  })

  it('non-active picker: no Pick buttons anywhere', () => {
    render(<DraftSlicePickView draftState={DRAFT_STATE} tileByNumber={TILE_BY_NUMBER} currentPlayer={CURRENT_PLAYER_INACTIVE} onPickSlice={vi.fn()} pickError={null} />)
    expect(screen.queryByRole('button', { name: /pick this slice/i })).not.toBeInTheDocument()
  })

  it('clicking Pick calls onPickSlice with slice.id', () => {
    const onPickSlice = vi.fn()
    render(<DraftSlicePickView draftState={DRAFT_STATE} tileByNumber={TILE_BY_NUMBER} currentPlayer={CURRENT_PLAYER_ACTIVE} onPickSlice={onPickSlice} pickError={null} />)
    fireEvent.click(screen.getByRole('button', { name: /pick this slice/i }))
    expect(onPickSlice).toHaveBeenCalledWith('slice-0')
  })

  it('pickError rendered when set', () => {
    render(<DraftSlicePickView draftState={DRAFT_STATE} tileByNumber={TILE_BY_NUMBER} currentPlayer={CURRENT_PLAYER_ACTIVE} onPickSlice={vi.fn()} pickError="Something went wrong" />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })
})
