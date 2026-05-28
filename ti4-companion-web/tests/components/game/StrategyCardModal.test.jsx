import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StrategyCardModal, { StrategyCardPrimaryForm } from '../../../src/components/game/StrategyCardModal'

describe('StrategyCardModal', () => {
  const mockOnUseSecondary = vi.fn()
  const mockOnPassSecondary = vi.fn()
  const mockOnClose = vi.fn()

  const mockPlayers = [
    { id: 'p1', display_name: 'Alice', initiative_order: 1 },
    { id: 'p2', display_name: 'Bob', initiative_order: 2 },
    { id: 'p3', display_name: 'Charlie', initiative_order: 3 },
  ]

  const mockAbilityDefs = [
    {
      id: 'ability1',
      description: 'Gain 2 Strategy Tokens',
      ability_sources: [
        { source_type: 'strategy_card', source_id: '4', role: 'secondary' },
      ],
    },
  ]

  const mockActivePay = {
    card_number: 4,
    played_by_player_id: 'p1',
  }

  it('renders nothing when activePay is null', () => {
    const { container } = render(
      <StrategyCardModal
        activePay={null}
        responses={[]}
        myPlayerId="p1"
        players={mockPlayers}
        abilityDefs={mockAbilityDefs}
        isMyTurnToRespond={false}
        onUseSecondary={mockOnUseSecondary}
        onPassSecondary={mockOnPassSecondary}
        onClose={mockOnClose}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('card face header rendered with name, initiative, primary text, secondary text', () => {
    render(
      <StrategyCardModal
        activePay={mockActivePay}
        responses={[]}
        myPlayerId="p2"
        players={mockPlayers}
        abilityDefs={mockAbilityDefs}
        isMyTurnToRespond={false}
        onUseSecondary={mockOnUseSecondary}
        onPassSecondary={mockOnPassSecondary}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByText(/Construction.*Initiative 4/)).toBeInTheDocument()
    expect(screen.getByText(/Place 1 PDS or 1 space dock/)).toBeInTheDocument()
    expect(screen.getByText(/Secondary:.*Spend 1 command token from your strategy pool/)).toBeInTheDocument()
  })

  it('renders card holder name', () => {
    render(
      <StrategyCardModal
        activePay={mockActivePay}
        responses={[]}
        myPlayerId="p2"
        players={mockPlayers}
        abilityDefs={mockAbilityDefs}
        isMyTurnToRespond={false}
        onUseSecondary={mockOnUseSecondary}
        onPassSecondary={mockOnPassSecondary}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByText(/Alice played the primary ability/)).toBeInTheDocument()
  })

  it('card holder sees response list with status for each other player', () => {
    const responses = [
      { player_id: 'p2', status: 'pending', initiative_order: 2 },
      { player_id: 'p3', status: 'passed', initiative_order: 3 },
    ]
    render(
      <StrategyCardModal
        activePay={mockActivePay}
        responses={responses}
        myPlayerId="p1"
        players={mockPlayers}
        abilityDefs={mockAbilityDefs}
        isMyTurnToRespond={false}
        onUseSecondary={mockOnUseSecondary}
        onPassSecondary={mockOnPassSecondary}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByText(/Bob:.*pending/)).toBeInTheDocument()
    expect(screen.getByText(/Charlie:.*passed/)).toBeInTheDocument()
  })

  it('card holder sees CLOSE button', () => {
    const responses = [
      { player_id: 'p2', status: 'pending', initiative_order: 2 },
    ]
    render(
      <StrategyCardModal
        activePay={mockActivePay}
        responses={responses}
        myPlayerId="p1"
        players={mockPlayers}
        abilityDefs={mockAbilityDefs}
        isMyTurnToRespond={false}
        onUseSecondary={mockOnUseSecondary}
        onPassSecondary={mockOnPassSecondary}
        onClose={mockOnClose}
      />
    )
    const closeButton = screen.getByRole('button', { name: /CLOSE/ })
    expect(closeButton).toBeInTheDocument()
  })

  it('next-to-respond player sees secondary ability text and USE SECONDARY + PASS buttons', () => {
    const responses = [
      { player_id: 'p2', status: 'pending', initiative_order: 2 },
      { player_id: 'p3', status: 'pending', initiative_order: 3 },
    ]
    render(
      <StrategyCardModal
        activePay={mockActivePay}
        responses={responses}
        myPlayerId="p2"
        players={mockPlayers}
        abilityDefs={mockAbilityDefs}
        isMyTurnToRespond={true}
        onUseSecondary={mockOnUseSecondary}
        onPassSecondary={mockOnPassSecondary}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByText(/Gain 2 Strategy Tokens/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /USE SECONDARY/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /PASS/ })).toBeInTheDocument()
  })

  it('calls onUseSecondary when USE SECONDARY clicked', async () => {
    const user = userEvent.setup()
    const responses = [
      { player_id: 'p2', status: 'pending', initiative_order: 2 },
    ]
    render(
      <StrategyCardModal
        activePay={mockActivePay}
        responses={responses}
        myPlayerId="p2"
        players={mockPlayers}
        abilityDefs={mockAbilityDefs}
        isMyTurnToRespond={true}
        onUseSecondary={mockOnUseSecondary}
        onPassSecondary={mockOnPassSecondary}
        onClose={mockOnClose}
      />
    )
    await user.click(screen.getByRole('button', { name: /USE SECONDARY/ }))
    expect(mockOnUseSecondary).toHaveBeenCalledWith('ability1', expect.any(Object))
  })

  it('calls onPassSecondary when PASS clicked', async () => {
    const user = userEvent.setup()
    const responses = [
      { player_id: 'p2', status: 'pending', initiative_order: 2 },
    ]
    render(
      <StrategyCardModal
        activePay={mockActivePay}
        responses={responses}
        myPlayerId="p2"
        players={mockPlayers}
        abilityDefs={mockAbilityDefs}
        isMyTurnToRespond={true}
        onUseSecondary={mockOnUseSecondary}
        onPassSecondary={mockOnPassSecondary}
        onClose={mockOnClose}
      />
    )
    await user.click(screen.getByRole('button', { name: /PASS/ }))
    expect(mockOnPassSecondary).toHaveBeenCalled()
  })

  it('non-next player sees waiting message with correct player name', () => {
    const responses = [
      { player_id: 'p2', status: 'pending', initiative_order: 2 },
      { player_id: 'p3', status: 'pending', initiative_order: 3 },
    ]
    render(
      <StrategyCardModal
        activePay={mockActivePay}
        responses={responses}
        myPlayerId="p3"
        players={mockPlayers}
        abilityDefs={mockAbilityDefs}
        isMyTurnToRespond={false}
        onUseSecondary={mockOnUseSecondary}
        onPassSecondary={mockOnPassSecondary}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByText(/Waiting for Bob/)).toBeInTheDocument()
  })

  it('does not render USE SECONDARY for card holder', () => {
    const responses = [
      { player_id: 'p2', status: 'pending', initiative_order: 2 },
    ]
    render(
      <StrategyCardModal
        activePay={mockActivePay}
        responses={responses}
        myPlayerId="p1"
        players={mockPlayers}
        abilityDefs={mockAbilityDefs}
        isMyTurnToRespond={false}
        onUseSecondary={mockOnUseSecondary}
        onPassSecondary={mockOnPassSecondary}
        onClose={mockOnClose}
      />
    )
    expect(screen.queryByRole('button', { name: /USE SECONDARY/ })).not.toBeInTheDocument()
  })

  it('Warfare secondary shows home_system_key production trigger when returned', () => {
    const warfareActivePay = { card_number: 6, played_by_player_id: 'p1' }
    const warfareAbilityDefs = [
      {
        id: 'warfare_secondary',
        description: 'Produce units in your home system',
        ability_sources: [
          { source_type: 'strategy_card', source_id: '6', role: 'secondary' },
        ],
      },
    ]
    render(
      <StrategyCardModal
        activePay={warfareActivePay}
        responses={[{ player_id: 'p2', status: 'pending', initiative_order: 2 }]}
        myPlayerId="p2"
        players={mockPlayers}
        abilityDefs={warfareAbilityDefs}
        isMyTurnToRespond={true}
        onUseSecondary={mockOnUseSecondary}
        onPassSecondary={mockOnPassSecondary}
        onClose={mockOnClose}
        warfareHomeSystemKey="1,0"
      />
    )
    expect(screen.getByText(/Home system available for production.*1,0/)).toBeInTheDocument()
  })
})

describe('StrategyCardPrimaryForm', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()

  const myPlayer = {
    id: 'p1',
    display_name: 'Alice',
    planets: [
      { name: 'Mecatol Rex' },
      { name: 'Jord' },
    ],
  }
  const allPlayers = [
    { id: 'p1', display_name: 'Alice' },
    { id: 'p2', display_name: 'Bob' },
  ]
  const game = { phase: 'action', speaker_player_id: 'p2' }

  function renderForm(cardNumber, extraProps = {}) {
    return render(
      <StrategyCardPrimaryForm
        cardNumber={cardNumber}
        myPlayer={myPlayer}
        allPlayers={allPlayers}
        game={game}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        {...extraProps}
      />
    )
  }

  it('StrategyCardPrimaryForm renders card name and primary text', () => {
    renderForm(1)
    expect(screen.getByText(/Leadership/)).toBeInTheDocument()
    expect(screen.getByText(/Gain 3 command tokens/)).toBeInTheDocument()
  })

  it('StrategyCardPrimaryForm renders PLAY PRIMARY and CANCEL buttons', () => {
    renderForm(1)
    expect(screen.getByRole('button', { name: /PLAY PRIMARY/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /CANCEL/ })).toBeInTheDocument()
  })

  it('StrategyCardPrimaryForm renders planet_multiselect for Leadership', () => {
    renderForm(1)
    expect(screen.getByText(/Exhaust planets for influence/i)).toBeInTheDocument()
    expect(screen.getByText(/Mecatol Rex/)).toBeInTheDocument()
    expect(screen.getByText(/Jord/)).toBeInTheDocument()
  })

  it('StrategyCardPrimaryForm renders player_select for Politics', () => {
    renderForm(3)
    // label text, using getAllBy since primaryText also contains "speaker"
    expect(screen.getAllByText(/New speaker/i).length).toBeGreaterThanOrEqual(1)
    // speaker (p2) excluded — Alice (p1) shown as radio option
    expect(screen.getByRole('radio', { name: /Alice/i })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Bob/i })).not.toBeInTheDocument()
  })

  it('Politics form shows agendaPeekCards confirmation after submit', () => {
    const agendaPeekCards = [{ name: 'Incentive Program' }, { name: 'Mutiny' }]
    renderForm(3, { agendaPeekCards })
    expect(screen.getByText(/Top agenda cards:.*Incentive Program.*Mutiny/)).toBeInTheDocument()
  })

  it('onSubmit called when PLAY PRIMARY clicked', async () => {
    const user = userEvent.setup()
    renderForm(5)
    await user.click(screen.getByRole('button', { name: /PLAY PRIMARY/ }))
    expect(mockOnSubmit).toHaveBeenCalledWith(expect.any(Object))
  })

  it('onCancel called when CANCEL clicked', async () => {
    const user = userEvent.setup()
    renderForm(5)
    await user.click(screen.getByRole('button', { name: /CANCEL/ }))
    expect(mockOnCancel).toHaveBeenCalled()
  })

  it('StrategyCardPrimaryForm renders pool_select for Warfare', () => {
    renderForm(6)
    expect(screen.getByText(/Return to pool/i)).toBeInTheDocument()
    // pool radio labels — use getAllBy since primaryText also mentions tactic
    expect(screen.getAllByText(/^tactic$/i).length).toBeGreaterThanOrEqual(1)
  })

  it('StrategyCardPrimaryForm renders tech_select for Technology', () => {
    renderForm(7)
    expect(screen.getByText(/Research technology/i)).toBeInTheDocument()
  })
})
