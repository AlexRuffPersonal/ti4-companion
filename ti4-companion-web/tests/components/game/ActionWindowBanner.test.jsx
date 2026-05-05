import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ActionWindowBanner from '../../../src/components/game/ActionWindowBanner'

const baseWindow = {
  type: 'when_agenda_revealed',
  eligible_player_ids: ['p1'],
  passed_player_ids: [],
}

describe('ActionWindowBanner', () => {
  it('renders null when window is null', () => {
    const { container } = render(<ActionWindowBanner window={null} currentPlayerId="p1" onPlayCard={vi.fn()} onPass={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null when currentPlayerId not in eligible_player_ids', () => {
    const { container } = render(<ActionWindowBanner window={baseWindow} currentPlayerId="p2" onPlayCard={vi.fn()} onPass={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null when currentPlayerId already in passed_player_ids', () => {
    const w = { ...baseWindow, passed_player_ids: ['p1'] }
    const { container } = render(<ActionWindowBanner window={w} currentPlayerId="p1" onPlayCard={vi.fn()} onPass={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders banner with window label when player is eligible', () => {
    render(<ActionWindowBanner window={baseWindow} currentPlayerId="p1" onPlayCard={vi.fn()} onPass={vi.fn()} />)
    expect(screen.getByText('An agenda has been revealed')).toBeInTheDocument()
  })

  it('lists only cards matching the window timing with non-null ability', () => {
    const cards = [
      { id: 'c1', name: 'Diplomacy', timing: 'When an agenda is revealed:', ability: {} },
      { id: 'c2', name: 'Other Card', timing: 'Action:', ability: {} },
      { id: 'c3', name: 'No Ability', timing: 'When an agenda is revealed:', ability: null },
    ]
    render(<ActionWindowBanner window={baseWindow} currentPlayerId="p1" myCards={cards} onPlayCard={vi.fn()} onPass={vi.fn()} />)
    expect(screen.getByTestId('window-play-c1')).toBeInTheDocument()
    expect(screen.queryByTestId('window-play-c2')).toBeNull()
    expect(screen.queryByTestId('window-play-c3')).toBeNull()
  })

  it('clicking a card calls onPlayCard with card id', () => {
    const onPlayCard = vi.fn()
    const cards = [{ id: 'c1', name: 'Diplomacy', timing: 'When an agenda is revealed:', ability: {} }]
    render(<ActionWindowBanner window={baseWindow} currentPlayerId="p1" myCards={cards} onPlayCard={onPlayCard} onPass={vi.fn()} />)
    fireEvent.click(screen.getByTestId('window-play-c1'))
    expect(onPlayCard).toHaveBeenCalledWith('c1', {})
  })

  it('clicking Pass calls onPass', () => {
    const onPass = vi.fn()
    render(<ActionWindowBanner window={baseWindow} currentPlayerId="p1" onPlayCard={vi.fn()} onPass={onPass} />)
    fireEvent.click(screen.getByTestId('window-pass'))
    expect(onPass).toHaveBeenCalled()
  })

  it('Pass button disabled when loading=true', () => {
    render(<ActionWindowBanner window={baseWindow} currentPlayerId="p1" onPlayCard={vi.fn()} onPass={vi.fn()} loading={true} />)
    expect(screen.getByTestId('window-pass')).toBeDisabled()
  })
})
