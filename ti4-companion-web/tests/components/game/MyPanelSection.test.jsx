import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MyPanelSection from '../../../src/components/game/MyPanelSection.jsx'

vi.mock('../../../src/components/game/StrategyCardPanel.jsx', () => ({
  default: ({ activePay, player }) => (
    <div data-testid="strategy-card-panel">
      {activePay && <span>active-pay</span>}
      {player?.strategy_card && <span>card-{player.strategy_card}</span>}
    </div>
  )
}))

vi.mock('../../../src/components/game/LeaderPanel.jsx', () => ({
  default: (props) => (
    <div data-testid="leader-panel">
      {props.agent && <span>agent-{props.agent.id ?? 'present'}</span>}
    </div>
  )
}))

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
      secretCount={0}
      onOpenSecrets={vi.fn()}
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

  it('shows Secrets button with count when secretCount is provided', () => {
    renderPanel({ secretCount: 2, onOpenSecrets: vi.fn() })
    expect(screen.getByRole('button', { name: /secrets \(2\)/i })).toBeInTheDocument()
  })

  it('calls onOpenSecrets when Secrets button is clicked', () => {
    const onOpenSecrets = vi.fn()
    renderPanel({ secretCount: 1, onOpenSecrets })
    fireEvent.click(screen.getByRole('button', { name: /secrets \(1\)/i }))
    expect(onOpenSecrets).toHaveBeenCalledOnce()
  })

  it('returns null when player is not provided', () => {
    const { container } = render(
      <MyPanelSection
        player={null}
        planets={[]}
        isActive={false}
        game={{ phase: 'action' }}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows Promissory Notes button with count', () => {
    renderPanel({ noteCount: 3 })
    expect(screen.getByRole('button', { name: /promissory notes \(3\)/i })).toBeInTheDocument()
  })

  it('calls onOpenNotes when Promissory Notes button is clicked', () => {
    const onOpenNotes = vi.fn()
    renderPanel({ noteCount: 1, onOpenNotes })
    fireEvent.click(screen.getByRole('button', { name: /promissory notes/i }))
    expect(onOpenNotes).toHaveBeenCalledOnce()
  })

  it('shows Trade button and calls onOpenTrade when clicked', () => {
    const onOpenTrade = vi.fn()
    renderPanel({ onOpenTrade })
    const btn = screen.getByRole('button', { name: /^trade$/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onOpenTrade).toHaveBeenCalledOnce()
  })

  it('increments commodities when + button is clicked', () => {
    const onUpdateCommodities = vi.fn()
    renderPanel({
      player: { ...PLAYER, commodities: 2 },
      planets: [],
      onUpdateCommodities
    })
    const addButtons = screen.getAllByRole('button', { name: '+' })
    fireEvent.click(addButtons[addButtons.length - 2]) // Trade + is last, commodities + is second to last
    expect(onUpdateCommodities).toHaveBeenCalledWith(3)
  })

  it('decrements commodities when − button is clicked', () => {
    const onUpdateCommodities = vi.fn()
    renderPanel({
      player: { ...PLAYER, commodities: 2 },
      planets: [],
      onUpdateCommodities
    })
    const subButtons = screen.getAllByRole('button', { name: '−' })
    fireEvent.click(subButtons[subButtons.length - 2])
    expect(onUpdateCommodities).toHaveBeenCalledWith(1)
  })

  it('prevents commodities from going below zero', () => {
    const onUpdateCommodities = vi.fn()
    renderPanel({
      player: { ...PLAYER, commodities: 0 },
      planets: [],
      onUpdateCommodities
    })
    const subButtons = screen.getAllByRole('button', { name: '−' })
    fireEvent.click(subButtons[subButtons.length - 2])
    expect(onUpdateCommodities).toHaveBeenCalledWith(0)
  })

  it('increments trade goods when + button is clicked', () => {
    const onUpdateTradeGoods = vi.fn()
    renderPanel({
      player: { ...PLAYER, trade_goods: 1 },
      planets: [],
      onUpdateTradeGoods
    })
    const addButtons = screen.getAllByRole('button', { name: '+' })
    fireEvent.click(addButtons[addButtons.length - 1]) // Last + button is trade
    expect(onUpdateTradeGoods).toHaveBeenCalledWith(2)
  })

  it('decrements trade goods when − button is clicked', () => {
    const onUpdateTradeGoods = vi.fn()
    renderPanel({
      player: { ...PLAYER, trade_goods: 2 },
      planets: [],
      onUpdateTradeGoods
    })
    const subButtons = screen.getAllByRole('button', { name: '−' })
    fireEvent.click(subButtons[subButtons.length - 1]) // Last − button is trade
    expect(onUpdateTradeGoods).toHaveBeenCalledWith(1)
  })

  it('prevents trade goods from going below zero', () => {
    const onUpdateTradeGoods = vi.fn()
    renderPanel({
      player: { ...PLAYER, trade_goods: 0 },
      planets: [],
      onUpdateTradeGoods
    })
    const subButtons = screen.getAllByRole('button', { name: '−' })
    fireEvent.click(subButtons[subButtons.length - 1])
    expect(onUpdateTradeGoods).toHaveBeenCalledWith(0)
  })

  it('calls onExhaustPlanet when exhaust button is clicked on ready planet', () => {
    const onExhaustPlanet = vi.fn()
    renderPanel({ onExhaustPlanet })
    const buttons = screen.getAllByRole('button', { name: /exhaust/i })
    fireEvent.click(buttons[0])
    expect(onExhaustPlanet).toHaveBeenCalledWith('Mecatol Rex')
  })

  it('calls onReadyPlanet when ready button is clicked on exhausted planet', () => {
    const onReadyPlanet = vi.fn()
    renderPanel({ onReadyPlanet })
    const buttons = screen.getAllByRole('button', { name: /ready/i })
    fireEvent.click(buttons[0])
    expect(onReadyPlanet).toHaveBeenCalledWith('Jord')
  })

  it('shows exhausted planet with line-through style', () => {
    renderPanel()
    expect(screen.getByText('Jord')).toHaveClass('line-through')
    expect(screen.getByText('Mecatol Rex')).not.toHaveClass('line-through')
  })

  it('displays technology count', () => {
    renderPanel()
    expect(screen.getByText(/technologies \(2\)/i)).toBeInTheDocument()
  })

  it('displays VIEW TREE button and calls onViewTech', () => {
    const onViewTech = vi.fn()
    renderPanel({ onViewTech })
    const btn = screen.getByRole('button', { name: /view tree/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onViewTech).toHaveBeenCalledOnce()
  })

  it('adjusts token count during status phase', () => {
    renderPanel({ game: { phase: 'status' } })
    const addButtons = screen.getAllByRole('button', { name: '+' })
    fireEvent.click(addButtons[0]) // First + is tactic token
    expect(screen.getByLabelText('tactic tokens')).toHaveValue('4')
  })

  it('confirms token changes with onUpdateTokens during status phase', () => {
    const onUpdateTokens = vi.fn()
    renderPanel({ game: { phase: 'status' }, onUpdateTokens })
    const addButtons = screen.getAllByRole('button', { name: '+' })
    fireEvent.click(addButtons[0]) // First + is tactic token
    const confirmBtn = screen.getByRole('button', { name: /confirm tokens/i })
    fireEvent.click(confirmBtn)
    expect(onUpdateTokens).toHaveBeenCalledWith({ tactic_total: 4, fleet: 3, strategy: 2 })
  })

  it('renders action-timed faction abilities as buttons', () => {
    const ability = {
      id: 'a1',
      ability_name: 'Test Action',
      trigger: { event: 'PLAYER_ACTION' }
    }
    renderPanel({ factionAbilities: [ability], triggerableAbilityIds: new Set(['a1']) })
    const btn = screen.getByRole('button', { name: /test action/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveClass('btn-primary')
  })

  it('calls onPlayAbility when action-timed ability is clicked', () => {
    const onPlayAbility = vi.fn()
    const ability = {
      id: 'a1',
      ability_name: 'Test Action',
      trigger: { event: 'PLAYER_ACTION' }
    }
    renderPanel({
      factionAbilities: [ability],
      triggerableAbilityIds: new Set(['a1']),
      onPlayAbility
    })
    fireEvent.click(screen.getByRole('button', { name: /test action/i }))
    expect(onPlayAbility).toHaveBeenCalledWith(ability)
  })

  it('disables action-timed ability when not triggerable', () => {
    const ability = {
      id: 'a1',
      ability_name: 'Test Action',
      trigger: { event: 'PLAYER_ACTION' }
    }
    renderPanel({
      factionAbilities: [ability],
      triggerableAbilityIds: new Set()
    })
    const btn = screen.getByRole('button', { name: /test action/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveClass('opacity-50')
  })

  it('renders passive faction abilities as text', () => {
    const ability = {
      id: 'a1',
      ability_name: 'Test Passive',
      trigger: { event: 'SOMETHING_ELSE' }
    }
    renderPanel({ factionAbilities: [ability] })
    expect(screen.getByText('Test Passive:')).toBeInTheDocument()
    const passiveElements = screen.queryAllByText((content, element) =>
      content === 'passive' && element?.className.includes('text-dim')
    )
    expect(passiveElements.length).toBeGreaterThan(0)
  })

  it('renders commander unlock section when available', () => {
    const commander = {
      id: 'cmd1',
      ability_name: 'Supreme Commander'
    }
    renderPanel({ unlockableCommanderAbility: commander })
    expect(screen.getByText(/commander unlockable: supreme commander/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument()
  })

  it('calls onUnlockCommander when unlock button is clicked', () => {
    const onUnlockCommander = vi.fn()
    const commander = {
      id: 'cmd1',
      ability_name: 'Supreme Commander'
    }
    renderPanel({
      unlockableCommanderAbility: commander,
      onUnlockCommander
    })
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    expect(onUnlockCommander).toHaveBeenCalledWith(commander)
  })

  it('does not render commander section when not available', () => {
    renderPanel({ unlockableCommanderAbility: null })
    expect(screen.queryByText(/commander unlockable/i)).not.toBeInTheDocument()
  })

  it('does not render faction abilities section when empty', () => {
    renderPanel({ factionAbilities: [] })
    expect(screen.queryByText(/faction abilities/i)).not.toBeInTheDocument()
  })

  it('does not render planets section when empty', () => {
    renderPanel({ planets: [] })
    expect(screen.queryByText(/planets/i)).not.toBeInTheDocument()
  })

  describe('planetStaticMap', () => {
    const PLANET_WELFOR = { id: 'pl3', player_id: 'p1', planet_name: 'Welfor', exhausted: false }
    const staticMapWithWelfor = {
      Welfor: { resources: 2, influence: 0, tech_specialty: 'blue', traits: ['cultural'] }
    }

    it('shows resources/influence, tech chip, and trait when planetStaticMap has entry', () => {
      renderPanel({ planets: [PLANET_WELFOR], planetStaticMap: staticMapWithWelfor })
      expect(screen.getByText((content, el) => el?.tagName === 'SPAN' && /2.*0/.test(el.textContent))).toBeInTheDocument()
      expect(screen.getByText('B')).toBeInTheDocument()
      expect(screen.getByText('cultural')).toBeInTheDocument()
    })

    it('does not render tech chip when tech_specialty is null', () => {
      const map = { Welfor: { resources: 2, influence: 0, tech_specialty: null, traits: ['cultural'] } }
      renderPanel({ planets: [PLANET_WELFOR], planetStaticMap: map })
      expect(screen.queryByText('B')).not.toBeInTheDocument()
      expect(screen.queryByText('G')).not.toBeInTheDocument()
      expect(screen.queryByText('R')).not.toBeInTheDocument()
      expect(screen.queryByText('Y')).not.toBeInTheDocument()
    })

    it('does not render trait labels when traits is empty', () => {
      const map = { Welfor: { resources: 2, influence: 0, tech_specialty: 'blue', traits: [] } }
      renderPanel({ planets: [PLANET_WELFOR], planetStaticMap: map })
      expect(screen.queryByText('CULTURAL')).not.toBeInTheDocument()
      expect(screen.queryByText('HAZARDOUS')).not.toBeInTheDocument()
      expect(screen.queryByText('INDUSTRIAL')).not.toBeInTheDocument()
    })

    it('renders planet name and EXHAUST button without crash when planetStaticMap has no entry for planet', () => {
      renderPanel({ planets: [PLANET_WELFOR], planetStaticMap: {} })
      expect(screen.getByText('Welfor')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /exhaust/i })).toBeInTheDocument()
      expect(screen.queryByText((content, el) => el?.tagName === 'SPAN' && /\d+\/\d+/.test(el.textContent))).not.toBeInTheDocument()
    })

    it('renders planet rows without crash when planetStaticMap prop is omitted', () => {
      renderPanel({ planets: [PLANET_WELFOR] })
      expect(screen.getByText('Welfor')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /exhaust/i })).toBeInTheDocument()
    })
  })

  it('renders StrategyCardPanel with correct props', () => {
    const allPlayers = [PLAYER]
    const onPlayPrimary = vi.fn()
    renderPanel({
      allPlayers,
      onPlayPrimary
    })
    expect(screen.getByTestId('strategy-card-panel')).toBeInTheDocument()
  })

  it('passes activePay through to StrategyCardPanel', () => {
    const allPlayers = [PLAYER]
    const activePay = { amount: 5 }
    const onPlayPrimary = vi.fn()
    renderPanel({
      allPlayers,
      activePay,
      onPlayPrimary
    })
    expect(screen.getByText('active-pay')).toBeInTheDocument()
  })

  it('renders LeaderPanel when leaders prop is provided', () => {
    const leaders = {
      agent: { id: 'ag1' },
      commander: { id: 'cmd1' },
      hero: { id: 'hr1' },
      factionMech: { id: 'mech1' },
      leaderStatus: {},
      unlockCommander: vi.fn(),
      unlockHero: vi.fn(),
      resolveLeaderAbility: vi.fn(),
    }
    renderPanel({ leaders })
    expect(screen.getByTestId('leader-panel')).toBeInTheDocument()
  })

  it('does not render LeaderPanel when leaders is undefined', () => {
    renderPanel({ leaders: undefined })
    expect(screen.queryByTestId('leader-panel')).not.toBeInTheDocument()
  })

  it('does not render LeaderPanel when leaders is null', () => {
    renderPanel({ leaders: null })
    expect(screen.queryByTestId('leader-panel')).not.toBeInTheDocument()
  })
})
