import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScoreboardSection from '../../../src/components/game/ScoreboardSection.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice', faction: 'Arborec', colour: 'green',  strategy_card: 1, passed: false, vp: 8, action_card_count: 3 },
  { id: 'p2', display_name: 'Bob',   faction: 'Letnev',  colour: 'red',    strategy_card: 3, passed: true,  vp: 5, action_card_count: 0 },
  { id: 'p3', display_name: 'Carol', faction: 'Saar',    colour: 'yellow', strategy_card: 5, passed: false, vp: 3, action_card_count: 7 },
]

const ACTION_GAME = { phase: 'action', active_player_id: 'p1' }

function renderScoreboard(props = {}) {
  return render(
    <ScoreboardSection
      players={PLAYERS}
      game={ACTION_GAME}
      currentPlayerId="p1"
      {...props}
    />
  )
}

describe('ScoreboardSection', () => {
  it('renders all player names', () => {
    renderScoreboard()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Carol')).toBeInTheDocument()
  })

  it('shows ACTIVE badge for the active player', () => {
    renderScoreboard()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  })

  it('shows PASSED badge for passed players', () => {
    renderScoreboard()
    expect(screen.getByText('PASSED')).toBeInTheDocument()
  })

  it('shows VP for each player', () => {
    renderScoreboard()
    expect(screen.getByText('8 VP')).toBeInTheDocument()
    expect(screen.getByText('5 VP')).toBeInTheDocument()
    expect(screen.getByText('3 VP')).toBeInTheDocument()
  })

  it('shows strategy card number when assigned', () => {
    renderScoreboard()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows no active/passed badge during strategy phase', () => {
    renderScoreboard({ game: { phase: 'strategy', active_player_id: null } })
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument()
    expect(screen.queryByText('PASSED')).not.toBeInTheDocument()
  })

  it('shows action card count badge for each player', () => {
    renderScoreboard()
    expect(screen.getByLabelText('Alice action cards: 3')).toBeInTheDocument()
    expect(screen.getByLabelText('Bob action cards: 0')).toBeInTheDocument()
    expect(screen.getByLabelText('Carol action cards: 7')).toBeInTheDocument()
  })

  it('shows secret objective count badge for each player', () => {
    const players = [
      { id: 'p1', display_name: 'Alice', vp: 5, colour: 'green', passed: false, action_card_count: 2, secret_objective_count: 1 },
      { id: 'p2', display_name: 'Bob',   vp: 3, colour: 'red',   passed: false, action_card_count: 0, secret_objective_count: 0 },
    ]
    render(<ScoreboardSection players={players} game={{ phase: 'action' }} currentPlayerId="p1" onViewTech={vi.fn()} />)
    expect(screen.getByLabelText(/alice secret objectives: 1/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/bob secret objectives: 0/i)).toBeInTheDocument()
  })

  it('renders faction emblem icon when faction maps to a known slug', () => {
    const players = [
      { ...PLAYERS[0], faction: 'The Arborec' },
      { ...PLAYERS[1], faction: 'The Barony of Letnev' },
      { ...PLAYERS[2], faction: 'The Clan of Saar' },
    ]
    render(
      <ScoreboardSection players={players} game={ACTION_GAME} currentPlayerId="p1" />
    )
    expect(screen.getByRole('img', { name: 'arborec' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'barony' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'clan-saar' })).toBeInTheDocument()
  })

  it('renders no faction icon when faction name is unknown', () => {
    renderScoreboard()
    expect(screen.queryByRole('img', { name: /arborec/i })).toBeNull()
  })
})
