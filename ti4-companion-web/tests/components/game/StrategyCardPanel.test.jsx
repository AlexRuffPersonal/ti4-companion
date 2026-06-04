import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StrategyCardPanel from '../../../src/components/game/StrategyCardPanel.jsx'

const PLAYER = {
  id: 'p1',
  display_name: 'Alice',
  strategy_card: null,
}

const GAME = {
  phase: 'strategy',
}

const ALL_PLAYERS = [PLAYER]

function renderPanel(overrides = {}) {
  return render(
    <StrategyCardPanel
      player={PLAYER}
      game={GAME}
      allPlayers={ALL_PLAYERS}
      activePay={null}
      isActive={false}
      onPickStrategyCard={vi.fn()}
      onPlayPrimary={vi.fn()}
      {...overrides}
    />
  )
}

describe('StrategyCardPanel', () => {
  it('renders card picker during strategy phase when no card picked', () => {
    renderPanel({ game: { phase: 'strategy' }, player: { ...PLAYER, strategy_card: null } })
    // Should show available card numbers
    expect(screen.getByText(/1/)).toBeInTheDocument()
    expect(screen.getByText(/2/)).toBeInTheDocument()
  })

  it('renders selected card label during strategy phase when card picked', () => {
    renderPanel({
      game: { phase: 'strategy' },
      player: { ...PLAYER, strategy_card: 3 },
    })
    expect(screen.getByText(/politics/i)).toBeInTheDocument()
  })

  it('calls onPickStrategyCard with correct number on card tap', () => {
    const onPickStrategyCard = vi.fn()
    renderPanel({
      game: { phase: 'strategy' },
      player: { ...PLAYER, strategy_card: null },
      onPickStrategyCard,
    })
    const card1Button = screen.getByRole('button', { name: /1.*leadership/i })
    fireEvent.click(card1Button)
    expect(onPickStrategyCard).toHaveBeenCalledWith(1)
  })

  it('renders PLAY <card name> button when action phase, isActive, no activePay', () => {
    renderPanel({
      game: { phase: 'action' },
      player: { ...PLAYER, strategy_card: 2 },
      isActive: true,
      activePay: null,
      onPlayPrimary: vi.fn(),
    })
    expect(screen.getByRole('button', { name: /play diplomacy/i })).toBeInTheDocument()
  })

  it('calls onPlayPrimary when play button is clicked', () => {
    const onPlayPrimary = vi.fn()
    renderPanel({
      game: { phase: 'action' },
      player: { ...PLAYER, strategy_card: 2 },
      isActive: true,
      activePay: null,
      onPlayPrimary,
    })
    fireEvent.click(screen.getByRole('button', { name: /play diplomacy/i }))
    expect(onPlayPrimary).toHaveBeenCalledOnce()
  })

  it('does not render play button when not active player', () => {
    renderPanel({
      game: { phase: 'action' },
      player: { ...PLAYER, strategy_card: 2 },
      isActive: false,
      activePay: null,
    })
    expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument()
  })

  it('shows card name as active label when activePay exists', () => {
    renderPanel({
      game: { phase: 'action' },
      player: { ...PLAYER, strategy_card: 4 },
      activePay: { card_number: 4 },
      isActive: true,
    })
    expect(screen.getByText(/construction is active/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument()
  })

  it('renders nothing during action phase when player has no strategy card', () => {
    const { container } = renderPanel({
      game: { phase: 'action' },
      player: { ...PLAYER, strategy_card: null },
      isActive: true,
    })
    expect(container.firstChild).toBeNull()
  })

  it('shows card name for all 8 strategy cards', () => {
    renderPanel({
      game: { phase: 'strategy' },
      player: { ...PLAYER, strategy_card: null },
    })

    const cardNames = [
      'Leadership',
      'Diplomacy',
      'Politics',
      'Construction',
      'Trade',
      'Warfare',
      'Technology',
      'Imperial',
    ]

    cardNames.forEach((name, index) => {
      const cardNum = index + 1
      const btn = screen.getByRole('button', { name: new RegExp(`${cardNum}.*${name}`, 'i') })
      expect(btn).toBeInTheDocument()
    })
  })

  it('excludes cards already held by other players from picker', () => {
    const otherPlayer = { ...PLAYER, id: 'p2', strategy_card: 1 }
    renderPanel({
      game: { phase: 'strategy' },
      player: { ...PLAYER, strategy_card: null },
      allPlayers: [PLAYER, otherPlayer],
    })
    // Card 1 should not be available
    expect(screen.queryByRole('button', { name: /1.*leadership/i })).not.toBeInTheDocument()
    // Card 2 should be available
    expect(screen.getByRole('button', { name: /2.*diplomacy/i })).toBeInTheDocument()
  })

  it('excludes multiple held cards from picker', () => {
    const p2 = { ...PLAYER, id: 'p2', strategy_card: 1 }
    const p3 = { ...PLAYER, id: 'p3', strategy_card: 5 }
    renderPanel({
      game: { phase: 'strategy' },
      player: { ...PLAYER, strategy_card: null },
      allPlayers: [PLAYER, p2, p3],
    })
    expect(screen.queryByRole('button', { name: /1.*leadership/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /5.*trade/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2.*diplomacy/i })).toBeInTheDocument()
  })

  // New tests from p37 spec
  it('play button shows card name in action phase', () => {
    renderPanel({
      game: { phase: 'action' },
      player: { ...PLAYER, strategy_card: 6 },
      isActive: true,
      activePay: null,
    })
    expect(screen.getByRole('button', { name: /play warfare/i })).toBeInTheDocument()
  })

  it('dim label shows initiative + name when not active turn', () => {
    renderPanel({
      game: { phase: 'action' },
      player: { ...PLAYER, strategy_card: 5 },
      isActive: false,
      activePay: null,
    })
    expect(screen.getByText(/5\. trade/i)).toBeInTheDocument()
  })

  it('activePay label shows card name', () => {
    renderPanel({
      game: { phase: 'action' },
      player: { ...PLAYER, strategy_card: 7 },
      activePay: { card_number: 7 },
      isActive: false,
    })
    expect(screen.getByText(/technology is active/i)).toBeInTheDocument()
  })

  it('strategy phase selected label shows initiative + name', () => {
    renderPanel({
      game: { phase: 'strategy' },
      player: { ...PLAYER, strategy_card: 8 },
    })
    expect(screen.getByText(/8\. imperial selected/i)).toBeInTheDocument()
  })

  it('renders strategy card icon in picker button', () => {
    renderPanel({
      game: { phase: 'strategy' },
      player: { ...PLAYER, strategy_card: null },
    })
    // Card 1 = Leadership — icon alt should be "leadership"
    expect(screen.getByRole('img', { name: 'leadership' })).toBeInTheDocument()
  })
})
