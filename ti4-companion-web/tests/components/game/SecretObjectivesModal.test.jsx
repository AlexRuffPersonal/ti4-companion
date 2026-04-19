import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SecretObjectivesModal from '../../../src/components/game/SecretObjectivesModal.jsx'

const SECRETS = [
  { id: 's1', secret_objectives: { name: 'Become the Gatekeeper', timing: 'status', condition: 'Control Mecatol Rex' } },
  { id: 's2', secret_objectives: { name: 'Darken the Skies', timing: 'action', condition: 'Win a space combat' } },
]

function renderModal(gamePhase = 'status', overrides = {}) {
  return render(
    <SecretObjectivesModal
      secrets={SECRETS}
      game={{ phase: gamePhase }}
      onScore={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />
  )
}

describe('SecretObjectivesModal', () => {
  it('shows all held secret objective names', () => {
    renderModal()
    expect(screen.getByText('Become the Gatekeeper')).toBeInTheDocument()
    expect(screen.getByText('Darken the Skies')).toBeInTheDocument()
  })

  it('shows timing and condition for each objective', () => {
    renderModal()
    expect(screen.getByText(/control mecatol rex/i)).toBeInTheDocument()
  })

  it('Score button is active for timing-matching objective during status phase', () => {
    renderModal('status')
    // s1 has timing 'status', game is 'status' — button should be enabled
    const scoreBtns = screen.getAllByRole('button', { name: /score/i })
    const enabledBtn = scoreBtns.find(b => !b.disabled)
    expect(enabledBtn).toBeTruthy()
  })

  it('Score button is disabled for non-matching timing', () => {
    renderModal('status')
    // s2 has timing 'action', game is 'status' — button should be disabled
    const scoreBtns = screen.getAllByRole('button', { name: /score/i })
    const disabledBtn = scoreBtns.find(b => b.disabled)
    expect(disabledBtn).toBeTruthy()
  })

  it('all Score buttons disabled outside status phase', () => {
    renderModal('action')
    const scoreBtns = screen.getAllByRole('button', { name: /score/i })
    scoreBtns.forEach(b => expect(b).toBeDisabled())
  })

  it('calls onScore with objective id when Score is clicked', () => {
    const onScore = vi.fn()
    renderModal('status', { onScore })
    const scoreBtns = screen.getAllByRole('button', { name: /score/i })
    const enabledBtn = scoreBtns.find(b => !b.disabled)
    fireEvent.click(enabledBtn)
    expect(onScore).toHaveBeenCalledWith('s1')
  })

  it('calls onClose when Close button is clicked', () => {
    const onClose = vi.fn()
    renderModal('status', { onClose })
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})