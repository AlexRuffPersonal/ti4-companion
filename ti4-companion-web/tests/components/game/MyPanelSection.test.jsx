import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MyPanelSection from '../../../src/components/game/MyPanelSection.jsx'

const PLAYER = {
  id: 'p1', display_name: 'Alice', faction: 'Arborec', colour: 'green',
  strategy_card: null, passed: false, vp: 5,
  command_tokens: { tactic_total: 3, fleet: 3, strategy: 2 },
  commodities: 3, trade_goods: 1,
  technologies: ['Neural Motivator', 'Sarween Tools'],
  leaders: { agent: 'unlocked', commander: 'locked', hero: 'locked' },
  action_card_count: 4,
}
const PLANETS = [
  { id: 'pl1', player_id: 'p1', planet_name: 'Mecatol Rex', exhausted: false },
  { id: 'pl2', player_id: 'p1', planet_name: 'Jord', exhausted: true },
]

function renderPanel(overrides = {}) {
  return render(
    <MyPanelSection
      player={PLAYER}
      planets={PLANETS}
      isActive={false}
      game={{ phase: 'action' }}
      onPass={vi.fn()}
      onEndTurn={vi.fn()}
      onUpdateTokens={vi.fn()}
      onExhaustPlanet={vi.fn()}
      onReadyPlanet={vi.fn()}
      onPickStrategyCard={vi.fn()}
      onUpdateCommodities={vi.fn()}
      onUpdateTradeGoods={vi.fn()}
      onCycleLeader={vi.fn()}
      onOpenActionCards={vi.fn()}
      {...overrides}
    />
  )
}

describe('MyPanelSection', () => {
  it('renders command token counts', () => {
    renderPanel()
    expect(screen.getByText('3')).toBeInTheDocument() // tactic or fleet
  })

  it('renders commodities and trade goods', () => {
    renderPanel()
    expect(screen.getByText('3')).toBeInTheDocument() // commodities
    expect(screen.getByText('1')).toBeInTheDocument() // trade goods
  })

  it('renders planet names', () => {
    renderPanel()
    expect(screen.getByText('Mecatol Rex')).toBeInTheDocument()
    expect(screen.getByText('Jord')).toBeInTheDocument()
  })

  it('shows PASS and END TURN buttons when isActive=true', () => {
    renderPanel({ isActive: true })
    expect(screen.getByRole('button', { name: /pass/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /end turn/i })).toBeInTheDocument()
  })

  it('hides PASS and END TURN buttons when isActive=false', () => {
    renderPanel({ isActive: false })
    expect(screen.queryByRole('button', { name: /pass/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /end turn/i })).not.toBeInTheDocument()
  })

  it('calls onPass when PASS button is clicked', () => {
    const onPass = vi.fn()
    renderPanel({ isActive: true, onPass })
    fireEvent.click(screen.getByRole('button', { name: /pass/i }))
    expect(onPass).toHaveBeenCalledOnce()
  })

  it('calls onEndTurn when END TURN button is clicked', () => {
    const onEndTurn = vi.fn()
    renderPanel({ isActive: true, onEndTurn })
    fireEvent.click(screen.getByRole('button', { name: /end turn/i }))
    expect(onEndTurn).toHaveBeenCalledOnce()
  })

  it('shows token redistribution controls during status phase', () => {
    renderPanel({ game: { phase: 'status' } })
    expect(screen.getByRole('button', { name: /confirm tokens/i })).toBeInTheDocument()
  })

  it('hides token redistribution controls outside status phase', () => {
    renderPanel({ game: { phase: 'action' } })
    expect(screen.queryByRole('button', { name: /confirm tokens/i })).not.toBeInTheDocument()
  })

  it('shows Action Cards button with count and calls onOpenActionCards when clicked', () => {
    const onOpenActionCards = vi.fn()
    renderPanel({ onOpenActionCards })
    const btn = screen.getByRole('button', { name: /action cards \(4\)/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onOpenActionCards).toHaveBeenCalledOnce()
  })
})
