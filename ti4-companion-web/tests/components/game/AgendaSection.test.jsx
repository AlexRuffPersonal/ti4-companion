// tests/components/game/AgendaSection.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AgendaSection from '../../../src/components/game/AgendaSection.jsx'

const GAME_AGENDA_VOTING = {
  id: 'game-1',
  agenda_phase_step: 'agenda_1_voting',
  agenda_current_card_id: 'ag-1',
  agenda_vote_current_player_id: 'p2',
  speaker_player_id: 'p1',
}

const AGENDA = {
  id: 'ag-1',
  name: 'Political Censure',
  type: 'directive',
  outcome: 'For/Against',
  elect_type: null,
  tractable: false,
  effect_json: {},
}

const PLAYERS = [
  { id: 'p1', display_name: 'Alice' },
  { id: 'p2', display_name: 'Bob' },
]

const DEFAULT_PROPS = {
  game: GAME_AGENDA_VOTING,
  agenda: AGENDA,
  votes: [],
  players: PLAYERS,
  currentPlayer: { id: 'p2', display_name: 'Bob' },
  isSpeaker: false,
  planets: [],
  onDrawAgenda: vi.fn(),
  onCastVote: vi.fn(),
  onResolve: vi.fn(),
}

function renderSection(overrides = {}) {
  return render(<AgendaSection {...DEFAULT_PROPS} {...overrides} />)
}

describe('AgendaSection', () => {
  it('renders nothing when phase step is inactive', () => {
    const { container } = renderSection({ game: { ...GAME_AGENDA_VOTING, agenda_phase_step: 'inactive' } })
    expect(container.firstChild).toBeNull()
  })

  it('shows agenda card name when in play', () => {
    renderSection()
    expect(screen.getByText('Political Censure')).toBeInTheDocument()
  })

  it('shows "Draw Agenda" button when speaker and no card in play', () => {
    renderSection({
      isSpeaker: true,
      game: { ...GAME_AGENDA_VOTING, agenda_current_card_id: null },
      agenda: null,
    })
    expect(screen.getByRole('button', { name: /draw agenda/i })).toBeInTheDocument()
  })

  it('hides "Draw Agenda" for non-speaker', () => {
    renderSection({
      isSpeaker: false,
      game: { ...GAME_AGENDA_VOTING, agenda_current_card_id: null },
      agenda: null,
    })
    expect(screen.queryByRole('button', { name: /draw agenda/i })).not.toBeInTheDocument()
  })

  it('calls onDrawAgenda when speaker clicks Draw Agenda', () => {
    const onDrawAgenda = vi.fn()
    renderSection({
      isSpeaker: true,
      game: { ...GAME_AGENDA_VOTING, agenda_current_card_id: null },
      agenda: null,
      onDrawAgenda,
    })
    fireEvent.click(screen.getByRole('button', { name: /draw agenda/i }))
    expect(onDrawAgenda).toHaveBeenCalled()
  })

  it('shows Resolve button for speaker when all voted (current voter null)', () => {
    renderSection({
      isSpeaker: true,
      game: { ...GAME_AGENDA_VOTING, agenda_vote_current_player_id: null },
    })
    expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument()
  })

  it('hides Resolve button when voting is still in progress', () => {
    renderSection({ isSpeaker: true })
    expect(screen.queryByRole('button', { name: /resolve/i })).not.toBeInTheDocument()
  })
})
