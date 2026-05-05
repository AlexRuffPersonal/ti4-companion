// tests/components/game/ActionCardWindowPanel.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ActionCardWindowPanel from '../../../src/components/game/ActionCardWindowPanel.jsx'

describe('ActionCardWindowPanel', () => {
  const baseCombat = {
    phase: 'window_pre_assign_defender',
    attacker_player_id: 'atk',
    defender_player_id: 'def',
    window_passes: {},
    sustained_this_phase: [],
  }

  it('renders null when combat.phase does not start with window_', () => {
    const { container } = render(<ActionCardWindowPanel combat={{...baseCombat, phase:'attacker_roll'}} myPlayerId="def" windowCards={[]} onPlayCard={vi.fn()} onPass={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders window title for known phase', () => {
    render(<ActionCardWindowPanel combat={baseCombat} myPlayerId="def" windowCards={[]} onPlayCard={vi.fn()} onPass={vi.fn()} />)
    expect(screen.getByText('Before Defender Assigns — play a card or pass')).toBeInTheDocument()
  })

  it('renders card chip for each windowCard', () => {
    const cards = [{ id: 'c1', name: 'Shields Holding' }]
    render(<ActionCardWindowPanel combat={baseCombat} myPlayerId="def" windowCards={cards} onPlayCard={vi.fn()} onPass={vi.fn()} />)
    expect(screen.getByTestId('window-card-c1')).toBeInTheDocument()
  })

  it('clicking a non-targeted card calls onPlayCard immediately', () => {
    const onPlayCard = vi.fn()
    const cards = [{ id: 'c1', name: 'Shields Holding' }]
    render(<ActionCardWindowPanel combat={baseCombat} myPlayerId="def" windowCards={cards} onPlayCard={onPlayCard} onPass={vi.fn()} />)
    fireEvent.click(screen.getByTestId('window-card-c1'))
    expect(onPlayCard).toHaveBeenCalledWith('c1', undefined)
  })

  it('clicking Pass calls onPass', () => {
    const onPass = vi.fn()
    render(<ActionCardWindowPanel combat={baseCombat} myPlayerId="def" windowCards={[]} onPlayCard={vi.fn()} onPass={onPass} />)
    fireEvent.click(screen.getByTestId('window-pass'))
    expect(onPass).toHaveBeenCalled()
  })

  it('Pass button is disabled when localPassed=true', () => {
    const combat = { ...baseCombat, window_passes: { defender: true } }
    render(<ActionCardWindowPanel combat={combat} myPlayerId="def" windowCards={[]} onPlayCard={vi.fn()} onPass={vi.fn()} />)
    expect(screen.getByTestId('window-pass')).toBeDisabled()
  })

  it('shows waiting message when local passed and opponent not passed', () => {
    const combat = { ...baseCombat, window_passes: { defender: true } }
    render(<ActionCardWindowPanel combat={combat} myPlayerId="def" windowCards={[]} onPlayCard={vi.fn()} onPass={vi.fn()} />)
    expect(screen.getByText('Waiting for opponent…')).toBeInTheDocument()
  })

  it('Direct Hit chip shows unit picker; selecting calls onPlayCard with unit_id', () => {
    const onPlayCard = vi.fn()
    const combat = { ...baseCombat, sustained_this_phase: [{ unit_id: 'u1', unit_type: 'dreadnought' }] }
    const cards = [{ id: 'dh', name: 'Direct Hit' }]
    render(<ActionCardWindowPanel combat={combat} myPlayerId="def" windowCards={cards} onPlayCard={onPlayCard} onPass={vi.fn()} />)
    fireEvent.click(screen.getByTestId('window-card-dh'))
    fireEvent.click(screen.getByTestId('target-unit-u1'))
    expect(onPlayCard).toHaveBeenCalledWith('dh', { unit_id: 'u1' })
  })
})
