import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DiscardBrowserModal from '../../../src/components/game/DiscardBrowserModal'

const CARDS = [
  { id: 'c1', name: 'Infiltrate', text: 'Exhaust a technology.' },
  { id: 'c2', name: 'Scramble Frequency', text: 'Cancel a unit ability.' },
  { id: 'c3', name: 'Lucky Shot', text: 'Roll a die.' },
  { id: 'c4', name: 'Direct Hit', text: 'Destroy a unit.' },
]

function renderModal(props = {}) {
  const defaults = {
    open: true,
    cards: CARDS,
    maxSelect: 3,
    onConfirm: vi.fn(),
    onClose: vi.fn(),
  }
  return render(<DiscardBrowserModal {...defaults} {...props} />)
}

describe('DiscardBrowserModal', () => {
  it('renders null when not open', () => {
    const { container } = renderModal({ open: false })
    expect(container.firstChild).toBeNull()
  })

  it('renders all cards with name and text', () => {
    renderModal()
    expect(screen.getByText('Infiltrate')).toBeInTheDocument()
    expect(screen.getByText('Exhaust a technology.')).toBeInTheDocument()
    expect(screen.getByText('Scramble Frequency')).toBeInTheDocument()
    expect(screen.getByText('Cancel a unit ability.')).toBeInTheDocument()
  })

  it('allows selecting up to maxSelect cards', () => {
    renderModal({ maxSelect: 2 })
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])
    expect(checkboxes[0].checked).toBe(true)
    expect(checkboxes[1].checked).toBe(true)
  })

  it('disables unselected cards when maxSelect reached', () => {
    renderModal({ maxSelect: 2 })
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])
    // 3rd and 4th checkboxes should now be disabled
    expect(checkboxes[2]).toBeDisabled()
    expect(checkboxes[3]).toBeDisabled()
  })

  it('calls onConfirm with selected card ids', () => {
    const onConfirm = vi.fn()
    renderModal({ onConfirm })
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[2])
    fireEvent.click(screen.getByText(/Take Selected/))
    expect(onConfirm).toHaveBeenCalledWith(['c1', 'c3'])
  })

  it('calls onClose on Cancel', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('Confirm button disabled when nothing selected', () => {
    renderModal()
    const btn = screen.getByText(/Take Selected/)
    expect(btn).toBeDisabled()
  })
})
