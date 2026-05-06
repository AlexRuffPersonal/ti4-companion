import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ActionCardModal from '../../../src/components/game/ActionCardModal.jsx'

const CARDS = [
  {
    id: 'deck-1',
    action_card_id: 'ac-1',
    action_cards: { name: 'Hack Election', timing: 'Action', text: 'Change the outcome of this vote.', ability: null },
  },
  {
    id: 'deck-2',
    action_card_id: 'ac-2',
    action_cards: { name: 'Spy', timing: 'Action', text: "Look at a player's hand and steal a card.", ability: null },
  },
]

const ACTION_CARD = {
  id: 'deck-3',
  action_card_id: 'ac-3',
  action_cards: { name: 'Scramble Frequency', timing: 'Action: Before a space cannon fires', text: 'Cancel a space cannon shot.', ability: 'scramble_frequency' },
}

function renderModal(props = {}) {
  return render(
    <ActionCardModal
      cards={CARDS}
      onDraw={vi.fn()}
      onDiscard={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />
  )
}

describe('ActionCardModal', () => {
  it('renders card names and timing tags', () => {
    renderModal()
    expect(screen.getByText('Hack Election')).toBeInTheDocument()
    expect(screen.getByText('Spy')).toBeInTheDocument()
    expect(screen.getAllByText('Action')).toHaveLength(2)
  })

  it('renders card text', () => {
    renderModal()
    expect(screen.getByText('Change the outcome of this vote.')).toBeInTheDocument()
  })

  it('shows Draw button when hand has 7 or fewer cards', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /draw card/i })).toBeInTheDocument()
  })

  it('hides Draw button and shows discard-required banner when hand exceeds 7', () => {
    const overLimitCards = Array.from({ length: 8 }, (_, i) => ({
      id: `deck-${i}`,
      action_cards: { name: `Card ${i}`, timing: 'Action', text: 'Text.' },
    }))
    renderModal({ cards: overLimitCards })
    expect(screen.queryByRole('button', { name: /draw card/i })).not.toBeInTheDocument()
    expect(screen.getByText(/discard down to 7/i)).toBeInTheDocument()
  })

  it('calls onDraw when Draw button is clicked', () => {
    const onDraw = vi.fn()
    renderModal({ onDraw })
    fireEvent.click(screen.getByRole('button', { name: /draw card/i }))
    expect(onDraw).toHaveBeenCalledOnce()
  })

  it('calls onDiscard with card id when Play / Discard is clicked', () => {
    const onDiscard = vi.fn()
    renderModal({ onDiscard })
    const discardButtons = screen.getAllByRole('button', { name: /play \/ discard/i })
    fireEvent.click(discardButtons[0])
    expect(onDiscard).toHaveBeenCalledWith('deck-1')
  })

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows empty state message when hand is empty', () => {
    renderModal({ cards: [] })
    expect(screen.getByText(/your hand is empty/i)).toBeInTheDocument()
  })

  it('shows "Not yet enforced" for card with null ability', () => {
    renderModal({ cards: [CARDS[0]], isMyTurn: true })
    expect(screen.getByText(/not yet enforced/i)).toBeInTheDocument()
  })

  it('shows "Not yet enforced" for non-Action: timing card', () => {
    const agendaCard = {
      id: 'deck-4',
      action_card_id: 'ac-4',
      action_cards: { name: 'Political Favor', timing: 'Agenda', text: 'Remove a law.', ability: 'political_favor' },
    }
    renderModal({ cards: [agendaCard], isMyTurn: true })
    expect(screen.getByText(/not yet enforced/i)).toBeInTheDocument()
  })

  it('shows Play button for Action: card with non-null ability when isMyTurn=true', () => {
    renderModal({ cards: [ACTION_CARD], isMyTurn: true })
    expect(screen.getByTestId('play-card-deck-3')).toBeInTheDocument()
  })

  it('hides Play button when isMyTurn=false', () => {
    renderModal({ cards: [ACTION_CARD], isMyTurn: false })
    expect(screen.queryByTestId('play-card-deck-3')).not.toBeInTheDocument()
  })

  it('clicking Play shows confirmation form', () => {
    renderModal({ cards: [ACTION_CARD], isMyTurn: true, onPlayCard: vi.fn() })
    fireEvent.click(screen.getByTestId('play-card-deck-3'))
    expect(screen.getByTestId('confirm-play')).toBeInTheDocument()
  })

  it('confirming calls onPlayCard with card id', () => {
    const onPlayCard = vi.fn()
    renderModal({ cards: [ACTION_CARD], isMyTurn: true, onPlayCard })
    fireEvent.click(screen.getByTestId('play-card-deck-3'))
    fireEvent.click(screen.getByTestId('confirm-play'))
    expect(onPlayCard).toHaveBeenCalledWith('deck-3', {})
  })

  it('canceling confirmation form closes it', () => {
    renderModal({ cards: [ACTION_CARD], isMyTurn: true, onPlayCard: vi.fn() })
    fireEvent.click(screen.getByTestId('play-card-deck-3'))
    expect(screen.getByTestId('confirm-play')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByTestId('confirm-play')).not.toBeInTheDocument()
  })
})
