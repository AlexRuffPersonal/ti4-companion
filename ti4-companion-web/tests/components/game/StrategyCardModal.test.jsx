import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StrategyCardModal from '../../../src/components/game/StrategyCardModal'

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

  it('renders card number and card holder name', () => {
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
    expect(screen.getByText(/STRATEGY CARD 4/)).toBeInTheDocument()
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
    expect(mockOnUseSecondary).toHaveBeenCalledWith('ability1')
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
})
