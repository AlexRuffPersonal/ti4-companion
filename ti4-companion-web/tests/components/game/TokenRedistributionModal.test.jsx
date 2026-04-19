import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TokenRedistributionModal from '../../../src/components/game/TokenRedistributionModal.jsx'

const PLAYER = {
  id: 'p1',
  display_name: 'Alice',
  command_tokens: { tactic_total: 4, fleet: 3, strategy: 2 }, // total = 9
}

function renderModal(overrides = {}) {
  return render(
    <TokenRedistributionModal
      player={PLAYER}
      onSubmit={vi.fn()}
      {...overrides}
    />
  )
}

describe('TokenRedistributionModal', () => {
  it('shows current token values', () => {
    renderModal()
    expect(screen.getByLabelText(/tactic tokens/i)).toHaveValue('4')
    expect(screen.getByLabelText(/fleet tokens/i)).toHaveValue('3')
    expect(screen.getByLabelText(/strategy tokens/i)).toHaveValue('2')
  })

  it('shows the total token count', () => {
    renderModal()
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('increment button increases tactic count', () => {
    renderModal()
    const incBtn = screen.getAllByText('+')[0] // first + is tactic
    fireEvent.click(incBtn)
    expect(screen.getByLabelText(/tactic tokens/i)).toHaveValue('5')
  })

  it('decrement on one field constrains: must stay >= 0', () => {
    renderModal()
    // decrement tactic 4 times to 0
    const decBtn = screen.getAllByText('−')[0]
    fireEvent.click(decBtn)
    fireEvent.click(decBtn)
    fireEvent.click(decBtn)
    fireEvent.click(decBtn)
    expect(screen.getByLabelText(/tactic tokens/i)).toHaveValue('0')
    // clicking again should not go negative
    fireEvent.click(decBtn)
    expect(screen.getByLabelText(/tactic tokens/i)).toHaveValue('0')
  })

  it('calls onSubmit with new token split on confirm', () => {
    const onSubmit = vi.fn()
    renderModal({ onSubmit })
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onSubmit).toHaveBeenCalledWith({ tactic_total: 4, fleet: 3, strategy: 2 })
  })

  it('renders as a blocking overlay (fixed positioning class)', () => {
    const { container } = renderModal()
    expect(container.firstChild).toHaveClass('fixed')
  })
})