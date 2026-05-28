import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../../src/components/game/DraftSlicePickView.jsx', () => ({
  default: ({ pickError, onPickSlice }) => (
    <div data-testid="draft-slice-pick-view">
      <button onClick={() => onPickSlice?.('slice-0')}>Pick</button>
      {pickError && <span data-testid="pick-error">{pickError}</span>}
    </div>
  ),
}))

vi.mock('../../../src/components/game/DraftPlacementView.jsx', () => ({
  default: ({ placeError, onPlaceTile }) => (
    <div data-testid="draft-placement-view">
      <button onClick={() => onPlaceTile?.('32', '1,0', 0)}>Place</button>
      {placeError && <span data-testid="place-error">{placeError}</span>}
    </div>
  ),
}))

import DraftPanel from '../../../src/components/game/DraftPanel.jsx'

const BASE_PROPS = {
  tileByNumber: {},
  tileDataById: {},
  currentPlayer: { id: 'p1', display_name: 'Alice' },
  players: [],
  game: {},
  onPickSlice: vi.fn(),
  onPlaceTile: vi.fn(),
}

describe('DraftPanel', () => {
  it("renders DraftSlicePickView when phase='slice-pick'", () => {
    render(<DraftPanel {...BASE_PROPS} draftState={{ phase: 'slice-pick', slices: [], pick_order: [], pick_index: 0 }} />)
    expect(screen.getByTestId('draft-slice-pick-view')).toBeInTheDocument()
    expect(screen.queryByTestId('draft-placement-view')).not.toBeInTheDocument()
  })

  it("renders DraftPlacementView when phase='placement'", () => {
    render(<DraftPanel {...BASE_PROPS} draftState={{ phase: 'placement', hands: {}, placement_order: [], placement_index: 0, placed_tiles: {} }} />)
    expect(screen.getByTestId('draft-placement-view')).toBeInTheDocument()
    expect(screen.queryByTestId('draft-slice-pick-view')).not.toBeInTheDocument()
  })

  it("renders nothing when phase='complete'", () => {
    const { container } = render(<DraftPanel {...BASE_PROPS} draftState={{ phase: 'complete' }} />)
    expect(container.firstChild).toBeNull()
  })

  it('pickError propagated to DraftSlicePickView after failed pick', async () => {
    const onPickSlice = vi.fn().mockRejectedValue(new Error('Pick failed'))
    render(<DraftPanel {...BASE_PROPS} draftState={{ phase: 'slice-pick', slices: [], pick_order: [], pick_index: 0 }} onPickSlice={onPickSlice} />)
    fireEvent.click(screen.getByRole('button', { name: /pick/i }))
    await waitFor(() => {
      expect(screen.getByTestId('pick-error')).toHaveTextContent('Pick failed')
    })
  })

  it('placeError propagated to DraftPlacementView after failed place', async () => {
    const onPlaceTile = vi.fn().mockRejectedValue(new Error('Place failed'))
    render(<DraftPanel {...BASE_PROPS} draftState={{ phase: 'placement', hands: {}, placement_order: [], placement_index: 0, placed_tiles: {} }} onPlaceTile={onPlaceTile} />)
    fireEvent.click(screen.getByRole('button', { name: /place/i }))
    await waitFor(() => {
      expect(screen.getByTestId('place-error')).toHaveTextContent('Place failed')
    })
  })
})
