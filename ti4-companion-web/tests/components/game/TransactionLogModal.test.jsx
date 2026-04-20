import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TransactionLogModal from '../../../src/components/game/TransactionLogModal.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Player One' },
  { id: 'p2', display_name: 'Player Two' },
  { id: 'p3', display_name: 'Player Three' },
]

const TRANSACTIONS = [
  {
    id: 't1',
    from_player_id: 'p1',
    to_player_id: 'p2',
    items: {
      offer: { commodities: 2, trade_goods: 1, note_ids: [] },
      request: { commodities: 1, trade_goods: 0, note_ids: [] },
    },
    status: 'confirmed',
    confirmed_at: 2,
  },
  {
    id: 't2',
    from_player_id: 'p2',
    to_player_id: 'p3',
    items: {
      offer: { commodities: 0, trade_goods: 2, note_ids: ['n1'] },
      request: { commodities: 3, trade_goods: 0, note_ids: [] },
    },
    status: 'confirmed',
    confirmed_at: 3,
  },
  {
    id: 't3',
    from_player_id: 'p3',
    to_player_id: 'p1',
    items: {
      offer: { commodities: 1, trade_goods: 0, note_ids: [] },
      request: { commodities: 0, trade_goods: 1, note_ids: [] },
    },
    status: 'pending',
    confirmed_at: null,
  },
]

function renderModal(props = {}) {
  return render(
    <TransactionLogModal
      transactions={TRANSACTIONS}
      players={PLAYERS}
      onClose={vi.fn()}
      {...props}
    />
  )
}

describe('TransactionLogModal', () => {
  it('shows TRADE LOG header', () => {
    renderModal()
    expect(screen.getByText('TRADE LOG')).toBeInTheDocument()
  })

  it('renders only confirmed trades', () => {
    renderModal()
    // Only t1 and t2 are confirmed; t3 is pending
    expect(screen.getByText(/Player One → Player Two/)).toBeInTheDocument()
    expect(screen.getByText(/Player Two → Player Three/)).toBeInTheDocument()
  })

  it('does not render pending trades', () => {
    renderModal()
    // t3 is pending and should not appear
    expect(screen.queryByText(/Player Three → Player One/)).not.toBeInTheDocument()
  })

  it('displays empty state when no confirmed trades', () => {
    renderModal({ transactions: [] })
    expect(screen.getByText(/No trades yet/)).toBeInTheDocument()
  })

  it('displays empty state when only pending trades exist', () => {
    const onlyPending = [TRANSACTIONS[2]]
    renderModal({ transactions: onlyPending })
    expect(screen.getByText(/No trades yet/)).toBeInTheDocument()
  })

  it('renders trades in reverse chronological order', () => {
    renderModal()
    // confirmed_at is 2 and 3, should be displayed as 3 then 2
    const rows = screen.getAllByText(/Round/)
    expect(rows[0]).toHaveTextContent('Round 3') // newer trade first
    expect(rows[1]).toHaveTextContent('Round 2') // older trade second
  })

  it('shows proposer and recipient names', () => {
    renderModal()
    expect(screen.getByText(/Player One → Player Two/)).toBeInTheDocument()
    expect(screen.getByText(/Player Two → Player Three/)).toBeInTheDocument()
  })

  it('displays offered commodities and trade goods', () => {
    renderModal()
    expect(screen.getByText(/Offered: 2 comm, 1 trade goods/)).toBeInTheDocument()
    expect(screen.getByText(/Offered: 0 comm, 2 trade goods/)).toBeInTheDocument()
  })

  it('shows "+ note" when offer includes notes', () => {
    renderModal()
    expect(screen.getByText(/Offered: 0 comm, 2 trade goods \+ note/)).toBeInTheDocument()
  })

  it('does not show "+ note" when offer has no notes', () => {
    renderModal()
    expect(screen.getByText(/Offered: 2 comm, 1 trade goods$/)).toBeInTheDocument()
  })

  it('displays requested commodities and trade goods', () => {
    renderModal()
    expect(screen.getByText(/Requested: 1 comm, 0 trade goods/)).toBeInTheDocument()
    expect(screen.getByText(/Requested: 3 comm, 0 trade goods/)).toBeInTheDocument()
  })

  it('shows "+ note" when request includes notes', () => {
    const txWithNoteRequest = [{
      id: 't4',
      from_player_id: 'p1',
      to_player_id: 'p2',
      items: {
        offer: { commodities: 1, trade_goods: 0, note_ids: [] },
        request: { commodities: 0, trade_goods: 0, note_ids: ['n1'] },
      },
      status: 'confirmed',
      confirmed_at: 1,
    }]
    renderModal({ transactions: txWithNoteRequest })
    expect(screen.getByText(/Requested: 0 comm, 0 trade goods \+ note/)).toBeInTheDocument()
  })

  it('handles missing player gracefully', () => {
    const txWithUnknownPlayer = [{
      id: 't5',
      from_player_id: 'p1',
      to_player_id: 'unknown',
      items: {
        offer: { commodities: 1, trade_goods: 0, note_ids: [] },
        request: { commodities: 0, trade_goods: 1, note_ids: [] },
      },
      status: 'confirmed',
      confirmed_at: 1,
    }]
    renderModal({ transactions: txWithUnknownPlayer, players: PLAYERS })
    // Should still render without crashing
    expect(screen.getByText(/Player One →/)).toBeInTheDocument()
  })

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /CLOSE/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('modal is modal-focusable with fixed positioning', () => {
    const { container } = renderModal()
    const backdrop = container.querySelector('.fixed')
    expect(backdrop).toHaveClass('fixed', 'inset-0', 'z-50')
  })

  it('handles missing items properties gracefully', () => {
    const txWithMissingItems = [{
      id: 't6',
      from_player_id: 'p1',
      to_player_id: 'p2',
      items: {},
      status: 'confirmed',
      confirmed_at: 1,
    }]
    renderModal({ transactions: txWithMissingItems })
    expect(screen.getByText(/Offered: 0 comm, 0 trade goods/)).toBeInTheDocument()
    expect(screen.getByText(/Requested: 0 comm, 0 trade goods/)).toBeInTheDocument()
  })
})
