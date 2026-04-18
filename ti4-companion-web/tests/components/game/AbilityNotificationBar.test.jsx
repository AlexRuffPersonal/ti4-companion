import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AbilityNotificationBar from '../../../src/components/game/AbilityNotificationBar.jsx'

const ABILITIES = [
  { id: 'ab-1', ability_name: 'Pillage' },
  { id: 'ab-2', ability_name: 'Bribery' },
]

describe('AbilityNotificationBar', () => {
  it('renders nothing when triggerable is empty', () => {
    const { container } = render(<AbilityNotificationBar triggerable={[]} onPlay={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a notification for each triggerable ability', () => {
    render(<AbilityNotificationBar triggerable={ABILITIES} onPlay={vi.fn()} />)
    expect(screen.getByText(/pillage/i)).toBeInTheDocument()
    expect(screen.getByText(/bribery/i)).toBeInTheDocument()
  })

  it('calls onPlay with the ability when PLAY is clicked', () => {
    const onPlay = vi.fn()
    render(<AbilityNotificationBar triggerable={ABILITIES} onPlay={onPlay} />)
    fireEvent.click(screen.getAllByRole('button', { name: /play/i })[0])
    expect(onPlay).toHaveBeenCalledWith(ABILITIES[0])
  })

  it('hides a notification after DISMISS is clicked', () => {
    render(<AbilityNotificationBar triggerable={ABILITIES} onPlay={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /dismiss/i })[0])
    expect(screen.queryByText(/pillage/i)).not.toBeInTheDocument()
    expect(screen.getByText(/bribery/i)).toBeInTheDocument()
  })

  it('shows all notifications again when triggerable prop changes', () => {
    const { rerender } = render(<AbilityNotificationBar triggerable={ABILITIES} onPlay={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /dismiss/i })[0])
    const newAbilities = [{ id: 'ab-3', ability_name: 'New Ability' }]
    rerender(<AbilityNotificationBar triggerable={newAbilities} onPlay={vi.fn()} />)
    expect(screen.getByText(/new ability/i)).toBeInTheDocument()
  })
})
