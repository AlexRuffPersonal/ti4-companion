import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SecretObjectiveSelectionScreen from '../../../src/components/game/SecretObjectiveSelectionScreen.jsx'

const SECRETS = [
  { id: 's1', secret_objectives: { name: 'Become the Gatekeeper', timing: 'status', condition: 'Control Mecatol Rex at end of status phase' } },
  { id: 's2', secret_objectives: { name: 'Darken the Skies', timing: 'action', condition: 'Win a space combat in a system that contains another player\'s ships' } },
]

const PLAYERS = [
  { id: 'p2', display_name: 'Bob', secrets_selected: false },
]

function renderScreen(overrides = {}) {
  return render(
    <SecretObjectiveSelectionScreen
      secrets={SECRETS}
      pendingPlayers={[]}
      onDiscard={vi.fn()}
      {...overrides}
    />
  )
}

describe('SecretObjectiveSelectionScreen', () => {
  it('shows both secret objective names', () => {
    renderScreen()
    expect(screen.getByText('Become the Gatekeeper')).toBeInTheDocument()
    expect(screen.getByText('Darken the Skies')).toBeInTheDocument()
  })

  it('shows timing for each objective', () => {
    renderScreen()
    expect(screen.getAllByText(/status/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/action/i)).toBeInTheDocument()
  })

  it('shows condition for each objective', () => {
    renderScreen()
    expect(screen.getByText(/control mecatol rex/i)).toBeInTheDocument()
  })

  it('renders a Discard button for each secret', () => {
    renderScreen()
    const discardBtns = screen.getAllByRole('button', { name: /discard/i })
    expect(discardBtns).toHaveLength(2)
  })

  it('calls onDiscard with objective id when Discard is clicked', () => {
    const onDiscard = vi.fn()
    renderScreen({ onDiscard })
    const btns = screen.getAllByRole('button', { name: /discard/i })
    fireEvent.click(btns[0])
    expect(onDiscard).toHaveBeenCalledWith('s1')
  })

  it('shows pending players banner when others have not selected', () => {
    renderScreen({ pendingPlayers: [{ id: 'p2', display_name: 'Bob' }] })
    expect(screen.getByText(/bob/i)).toBeInTheDocument()
    expect(screen.getByText(/waiting/i)).toBeInTheDocument()
  })

  it('does not show pending banner when list is empty', () => {
    renderScreen({ pendingPlayers: [] })
    expect(screen.queryByText(/waiting/i)).not.toBeInTheDocument()
  })
})