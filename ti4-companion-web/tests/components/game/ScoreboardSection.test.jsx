import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScoreboardSection from '../../../src/components/game/ScoreboardSection.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice', faction: 'Arborec', colour: 'green',  strategy_card: 1, passed: false, vp: 8 },
  { id: 'p2', display_name: 'Bob',   faction: 'Letnev',  colour: 'red',    strategy_card: 3, passed: true,  vp: 5 },
  { id: 'p3', display_name: 'Carol', faction: 'Saar',    colour: 'yellow', strategy_card: 5, passed: false, vp: 3 },
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
})
