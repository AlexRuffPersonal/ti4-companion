// tests/components/game/VotingPanel.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VotingPanel from '../../../src/components/game/VotingPanel.jsx'

const AGENDA = {
  id: 'ag-1',
  name: 'Political Censure',
  outcome: 'For/Against',
  elect_type: null,
}

const VOTES = [
  { game_player_id: 'p1', choice: 'For', vote_count: 3, abstained: false },
]

const PLANETS = [
  { id: 'pl-1', planet_name: 'Nestphar', player_id: 'p2', exhausted: false, influence: 3, resources: 1 },
]

const DEFAULT_PROPS = {
  agenda: AGENDA,
  votes: VOTES,
  players: [
    { id: 'p1', display_name: 'Alice' },
    { id: 'p2', display_name: 'Bob' },
  ],
  currentPlayer: { id: 'p2', display_name: 'Bob' },
  currentVoterId: 'p2',
  planets: PLANETS,
  onCastVote: vi.fn(),
}

function renderPanel(overrides = {}) {
  return render(<VotingPanel {...DEFAULT_PROPS} {...overrides} />)
}

describe('VotingPanel', () => {
  it('shows the agenda name', () => {
    renderPanel()
    expect(screen.getByText('Political Censure')).toBeInTheDocument()
  })

  it('shows vote totals per choice', () => {
    renderPanel()
    expect(screen.getAllByText(/for/i).length).toBeGreaterThan(0)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows per-player vote status', () => {
    renderPanel()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it("shows vote controls when it is the current player's turn", () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /abstain/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /vote/i }).length).toBeGreaterThan(0)
  })

  it("hides vote controls when it is not the current player's turn", () => {
    renderPanel({ currentVoterId: 'p1' })
    expect(screen.queryByRole('button', { name: /abstain/i })).not.toBeInTheDocument()
  })

  it('calls onCastVote with abstain=true when abstain clicked', () => {
    const onCastVote = vi.fn()
    renderPanel({ onCastVote })
    fireEvent.click(screen.getByRole('button', { name: /abstain/i }))
    expect(onCastVote).toHaveBeenCalledWith({ abstain: true })
  })

  it('highlights whose turn it is', () => {
    renderPanel()
    expect(screen.getByText(/Bob.*◀/)).toBeInTheDocument()
  })

  it('renders agenda note when agenda.note is non-empty', () => {
    renderPanel({ agenda: { ...AGENDA, note: 'This agenda is about politics.' } })
    expect(screen.getByTestId('agenda-note')).toBeInTheDocument()
    expect(screen.getByTestId('agenda-note').textContent).toBe('This agenda is about politics.')
  })

  it('does not render note paragraph when agenda.note is null', () => {
    renderPanel({ agenda: { ...AGENDA, note: null } })
    expect(screen.queryByTestId('agenda-note')).not.toBeInTheDocument()
  })

  it('does not render note paragraph when agenda.note is empty string', () => {
    renderPanel({ agenda: { ...AGENDA, note: '' } })
    expect(screen.queryByTestId('agenda-note')).not.toBeInTheDocument()
  })
})
