import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EndTurnDialog from '../../../src/components/game/EndTurnDialog'

const readiedCard = { planet_name: 'primor', status: 'readied' }
const exhaustedCard = { planet_name: 'mirage', status: 'exhausted' }

function renderDialog(overrides = {}) {
  const props = {
    myCards: [readiedCard],
    exhaustCard: vi.fn().mockResolvedValue(undefined),
    onConfirmEndTurn: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  return { ...render(<EndTurnDialog {...props} />), props }
}

describe('EndTurnDialog', () => {
  it('renders nothing when no readied cards', () => {
    const { container } = renderDialog({ myCards: [exhaustedCard] })
    expect(container.firstChild).toBeNull()
  })

  it('renders one row per readied card with Use button', () => {
    const myCards = [readiedCard, { planet_name: 'mallice', status: 'readied' }]
    renderDialog({ myCards })
    expect(screen.getByText('The Atrament')).toBeInTheDocument()
    expect(screen.getByText('Exterrix Headquarters')).toBeInTheDocument()
    expect(screen.getAllByText('Use')).toHaveLength(2)
  })

  it('calls exhaustCard with planet_name when Use clicked', () => {
    const exhaustCard = vi.fn().mockResolvedValue(undefined)
    renderDialog({ exhaustCard })
    fireEvent.click(screen.getByText('Use'))
    expect(exhaustCard).toHaveBeenCalledWith('primor')
  })

  it('calls onConfirmEndTurn when Skip clicked', () => {
    const onConfirmEndTurn = vi.fn()
    renderDialog({ onConfirmEndTurn })
    fireEvent.click(screen.getByText('Skip & End Turn'))
    expect(onConfirmEndTurn).toHaveBeenCalled()
  })

  it('calls onConfirmEndTurn when Done clicked', () => {
    const onConfirmEndTurn = vi.fn()
    renderDialog({ onConfirmEndTurn })
    fireEvent.click(screen.getByText('Done, End Turn'))
    expect(onConfirmEndTurn).toHaveBeenCalled()
  })

  it('disables Use button while exhaustCard in flight', async () => {
    let resolve
    const exhaustCard = vi.fn().mockReturnValue(new Promise(r => { resolve = r }))
    renderDialog({ exhaustCard })
    fireEvent.click(screen.getByText('Use'))
    await waitFor(() => expect(screen.getByText('Use')).toBeDisabled())
    resolve()
    await waitFor(() => expect(screen.getByText('Use')).not.toBeDisabled())
  })
})
