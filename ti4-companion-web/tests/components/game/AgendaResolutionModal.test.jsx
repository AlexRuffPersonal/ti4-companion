// tests/components/game/AgendaResolutionModal.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AgendaResolutionModal from '../../../src/components/game/AgendaResolutionModal.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice' },
  { id: 'p2', display_name: 'Bob' },
]
const PLANETS = [
  { id: 'pl-1', planet_name: 'Mecatol Rex', player_id: 'p1', exhausted: false, influence: 1, resources: 1 },
]
const VOTES = [
  { game_player_id: 'p1', choice: 'For', vote_count: 3, abstained: false },
  { game_player_id: 'p2', choice: 'Against', vote_count: 1, abstained: false },
]

const DEFAULT_PROPS = {
  agenda: { id: 'ag-1', name: 'Political Censure', type: 'directive', elect_type: null, tractable: false, effect_json: {}, outcome: 'For/Against' },
  votes: VOTES,
  players: PLAYERS,
  planets: PLANETS,
  currentPlayerId: 'p1',
  onConfirm: vi.fn(),
  onClose: vi.fn(),
}

function renderModal(overrides = {}) {
  return render(<AgendaResolutionModal {...DEFAULT_PROPS} {...overrides} />)
}

describe('AgendaResolutionModal', () => {
  it('shows the agenda name', () => {
    renderModal()
    expect(screen.getByText(/political censure/i)).toBeInTheDocument()
  })

  it('shows vote totals', () => {
    renderModal()
    expect(screen.getByText(/for.*3/i)).toBeInTheDocument()
  })

  it('For/Against: calls onConfirm with "For" when For wins', () => {
    const onConfirm = vi.fn()
    renderModal({ onConfirm })
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith('For')
  })

  it('elect_type=player: shows player picker', () => {
    renderModal({ agenda: { ...DEFAULT_PROPS.agenda, elect_type: 'player', outcome: 'Elect Player' } })
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('elect_type=player: calls onConfirm with selected player id', () => {
    const onConfirm = vi.fn()
    renderModal({
      agenda: { ...DEFAULT_PROPS.agenda, elect_type: 'player', outcome: 'Elect Player' },
      onConfirm,
    })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p2' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith('p2')
  })

  it('non-tractable: shows manual reminder banner', () => {
    renderModal({ agenda: { ...DEFAULT_PROPS.agenda, type: 'law', tractable: false } })
    expect(screen.getByText(/host applies manually/i)).toBeInTheDocument()
  })

  it('calls onClose on cancel', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders note for all agendas when agenda.note is non-empty', () => {
    renderModal({ agenda: { ...DEFAULT_PROPS.agenda, note: 'Vote on whether to censure.' } })
    expect(screen.getByTestId('agenda-note')).toBeInTheDocument()
    expect(screen.getByTestId('agenda-note').textContent).toBe('Vote on whether to censure.')
  })

  it('renders HOST APPLIES MANUALLY warning only for non-tractable laws', () => {
    renderModal({ agenda: { ...DEFAULT_PROPS.agenda, type: 'law', tractable: false, note: 'A note.' } })
    expect(screen.getByText(/host applies manually/i)).toBeInTheDocument()
    expect(screen.getByTestId('agenda-note')).toBeInTheDocument()
  })

  it('tractable agenda with note: note rendered, no warning', () => {
    renderModal({ agenda: { ...DEFAULT_PROPS.agenda, type: 'law', tractable: true, note: 'A note.' } })
    expect(screen.getByTestId('agenda-note')).toBeInTheDocument()
    expect(screen.queryByText(/host applies manually/i)).not.toBeInTheDocument()
  })

  it('agenda with null note: no note paragraph', () => {
    renderModal({ agenda: { ...DEFAULT_PROPS.agenda, note: null } })
    expect(screen.queryByTestId('agenda-note')).not.toBeInTheDocument()
  })
})
