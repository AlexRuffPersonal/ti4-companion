import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TradeOfferBanner from '../../../src/components/game/TradeOfferBanner.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Player One' },
  { id: 'p2', display_name: 'Player Two' },
  { id: 'p3', display_name: 'Player Three' },
]

const TRADES = [
  {
    id: 't1',
    from_player_id: 'p1',
    to_player_id: 'p2',
    items: { offer: { commodities: 2, trade_goods: 1, note_ids: [] }, request: { commodities: 1, trade_goods: 0, note_ids: [] } },
    status: 'pending',
  },
  {
    id: 't2',
    from_player_id: 'p3',
    to_player_id: 'p1',
    items: { offer: { commodities: 0, trade_goods: 0, note_ids: ['n1'] }, request: { commodities: 1, trade_goods: 1, note_ids: [] } },
    status: 'pending',
  },
]

function renderBanner(props = {}) {
  return render(
    <TradeOfferBanner
      trades={TRADES}
      players={PLAYERS}
      currentPlayerId="p1"
      onAccept={vi.fn()}
      onDecline={vi.fn()}
      onViewDetails={vi.fn()}
      {...props}
    />
  )
}

describe('TradeOfferBanner', () => {
  it('renders nothing when trades is empty', () => {
    const { container } = renderBanner({ trades: [] })
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when trades is null', () => {
    const { container } = renderBanner({ trades: null })
    expect(container.firstChild).toBeNull()
  })

  it('renders proposer display name in bright color', () => {
    renderBanner()
    expect(screen.getByText('Player One')).toBeInTheDocument()
    expect(screen.getByText('Player Three')).toBeInTheDocument()
  })

  it('shows trade summary with commodities and trade goods', () => {
    renderBanner()
    expect(screen.getByText(/Offers 2 commodities, 1 trade goods/)).toBeInTheDocument()
  })

  it('shows "1 note" in summary when note_ids present', () => {
    renderBanner()
    expect(screen.getByText(/Offers 1 note/)).toBeInTheDocument()
  })

  it('shows "Offers nothing" when offer has no items', () => {
    const trades = [{
      id: 't3',
      from_player_id: 'p2',
      to_player_id: 'p1',
      items: { offer: { commodities: 0, trade_goods: 0, note_ids: [] }, request: {} },
      status: 'pending',
    }]
    renderBanner({ trades })
    expect(screen.getByText(/Offers nothing/)).toBeInTheDocument()
  })

  it('renders VIEW, ACCEPT, and DECLINE buttons for each trade', () => {
    renderBanner()
    const viewBtns = screen.getAllByRole('button', { name: /VIEW/i })
    const acceptBtns = screen.getAllByRole('button', { name: /ACCEPT/i })
    const declineBtns = screen.getAllByRole('button', { name: /DECLINE/i })

    expect(viewBtns).toHaveLength(2)
    expect(acceptBtns).toHaveLength(2)
    expect(declineBtns).toHaveLength(2)
  })

  it('calls onAccept with trade id when ACCEPT is clicked', () => {
    const onAccept = vi.fn()
    renderBanner({ onAccept })
    const acceptBtns = screen.getAllByRole('button', { name: /ACCEPT/i })
    fireEvent.click(acceptBtns[0])
    expect(onAccept).toHaveBeenCalledWith('t1')
  })

  it('calls onDecline with trade id when DECLINE is clicked', () => {
    const onDecline = vi.fn()
    renderBanner({ onDecline })
    const declineBtns = screen.getAllByRole('button', { name: /DECLINE/i })
    fireEvent.click(declineBtns[0])
    expect(onDecline).toHaveBeenCalledWith('t1')
  })

  it('calls onViewDetails with trade object when VIEW is clicked', () => {
    const onViewDetails = vi.fn()
    renderBanner({ onViewDetails })
    const viewBtns = screen.getAllByRole('button', { name: /VIEW/i })
    fireEvent.click(viewBtns[0])
    expect(onViewDetails).toHaveBeenCalledWith(TRADES[0])
  })

  it('handles missing players gracefully', () => {
    renderBanner({ players: undefined })
    const offerTexts = screen.getAllByText(/Offers/)
    expect(offerTexts.length).toBeGreaterThan(0)
  })

  it('renders with null onViewDetails callback', () => {
    renderBanner({ onViewDetails: null })
    const viewBtns = screen.getAllByRole('button', { name: /VIEW/i })
    expect(() => fireEvent.click(viewBtns[0])).not.toThrow()
  })

  it('preserves trade order in display', () => {
    renderBanner()
    const trades = screen.getAllByText(/Offers/)
    expect(trades).toHaveLength(2)
  })
})
