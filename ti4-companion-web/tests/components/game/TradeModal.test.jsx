import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TradeModal from '../../../src/components/game/TradeModal.jsx'

const PLAYER = { id: 'p1', commodities: 5, trade_goods: 3 }
const PLAYERS = [
  { id: 'p1', display_name: 'Alice' },
  { id: 'p2', display_name: 'Bob', held_notes: [] },
  { id: 'p3', display_name: 'Carol', held_notes: [] },
]
const MY_NOTES = [
  { id: 'n1', promissory_notes: { name: 'Tech Rider' } },
]

function renderModal(overrides = {}) {
  return render(
    <TradeModal
      currentPlayer={PLAYER}
      players={PLAYERS}
      myNotes={MY_NOTES}
      initialNoteId={undefined}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />
  )
}

describe('TradeModal', () => {
  it('commodity stepper capped at player commodities', () => {
    renderModal()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p2' } })
    const inputs = screen.getAllByDisplayValue('0')
    const commodityInput = inputs[0] // First one is commodities in "YOU SEND"
    fireEvent.change(commodityInput, { target: { value: '10' } })
    fireEvent.blur(commodityInput)
    expect(commodityInput.value).toBe('5')
  })

  it('submit disabled when no recipient selected', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /propose/i })).toBeDisabled()
  })

  it('calls onSubmit with correct payload', () => {
    const onSubmit = vi.fn()
    renderModal({ onSubmit })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p2' } })
    const commodityInput = screen.getAllByDisplayValue('0')[0]
    fireEvent.change(commodityInput, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /propose/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      to_player_id: 'p2',
      offer: expect.any(Object),
    }))
  })

  it('accepts empty receive side (gift)', () => {
    const onSubmit = vi.fn()
    renderModal({ onSubmit })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p2' } })
    const commodityInput = screen.getAllByDisplayValue('0')[0]
    fireEvent.change(commodityInput, { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /propose/i }))
    const call = onSubmit.mock.calls[0][0]
    expect(call.request).toEqual({ commodities: 0, trade_goods: 0, note_ids: [] })
  })

  it('prepopulates with initialNoteId in offer side', () => {
    renderModal({ initialNoteId: 'n1' })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p2' } })
    expect(screen.getByDisplayValue('Tech Rider')).toBeInTheDocument()
  })

  it('calls onClose when Close button clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})